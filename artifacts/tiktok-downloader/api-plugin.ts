import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

type Platform = "tiktok" | "youtube" | "instagram" | "facebook";

function detectPlatform(url: string): Platform | null {
  if (url.includes("tiktok.com") || url.includes("vm.tiktok.com")) return "tiktok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
  return null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function fetchTiktok(url: string) {
  const formData = new URLSearchParams();
  formData.append("url", url);
  formData.append("hd", "1");

  const response = await fetch("https://www.tikwm.com/api/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: formData.toString(),
  });

  if (!response.ok) throw new Error("Failed to reach TikTok download service");

  const data = (await response.json()) as {
    code: number;
    msg: string;
    data?: {
      id: string;
      title: string;
      cover: string;
      duration: number;
      play: string;
      hdplay?: string;
      author: { nickname: string; avatar: string };
      digg_count: number;
      comment_count: number;
      share_count: number;
    };
  };

  if (data.code !== 0 || !data.data) {
    throw new Error(data.msg || "Could not process this TikTok URL. Make sure the video is public.");
  }

  const v = data.data;
  return {
    id: v.id,
    title: v.title || "TikTok Video",
    author: v.author?.nickname || "Unknown",
    authorAvatar: v.author?.avatar ?? null,
    cover: v.cover ?? null,
    downloadUrl: v.hdplay || v.play || "",
    duration: v.duration || 0,
    platform: "tiktok" as Platform,
    likes: v.digg_count ?? null,
    comments: v.comment_count ?? null,
    shares: v.share_count ?? null,
  };
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function fetchYoutube(url: string) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error("Could not extract YouTube video ID from the URL.");

  const { Innertube, Platform } = await import("youtubei.js");
  const vm = await import("node:vm");

  // Provide a Node.js evaluator for youtubei.js to decipher cipher-signed URLs.
  // The generated script ends with a top-level `return process(...)` — valid only
  // inside a function body, which is exactly what `new Function(code)` creates.
  // eslint-disable-next-line no-new-func
  Platform.shim.eval = (data: { output: string }, _evalArgs: Record<string, unknown>) => {
    try {
      // new Function wraps the code in "function anonymous() { <code> }"
      // so the top-level `return` in the appended processor fn is allowed.
      const fn = new Function(data.output);
      return fn();
    } catch (e) {
      console.error("[player-eval] error:", e);
      throw e;
    }
  };

  // retrieve_player=true downloads the JS player needed to decipher cipher URLs
  const yt = await Innertube.create({ retrieve_player: true });

  const info = await yt.getInfo(videoId);
  const details = info.basic_info;
  const streamingData = info.streaming_data;

  if (!streamingData) throw new Error("No streaming data available for this video.");

  const allFormats = [
    ...(streamingData.formats ?? []),
    ...(streamingData.adaptive_formats ?? []),
  ];

  if (allFormats.length === 0) throw new Error("No formats returned for this video.");

  // Sort muxed (video+audio) formats by resolution, fall back to any format
  // NOTE: do NOT filter on f.url — cipher formats have url=null until decipher() is called
  const muxed = allFormats
    .filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  const chosen = muxed[0] ?? allFormats[0];

  // decipher() handles both pre-signed URLs (returns url directly)
  // and cipher-signed URLs (applies the JS player decipher transform)
  const downloadUrl = await chosen.decipher(yt.session.player);

  if (!downloadUrl) throw new Error("Could not generate a playable URL for this video.");

  const cover =
    details.thumbnail
      ?.sort((a: { width?: number }, b: { width?: number }) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
    ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    id: videoId,
    title: details.title || "YouTube Video",
    author: details.author || "Unknown",
    authorAvatar: null as null,
    cover,
    downloadUrl,
    duration: details.duration ?? 0,
    platform: "youtube" as Platform,
    likes: null as null,
    comments: null as null,
    shares: null as null,
  };
}

export function apiPlugin(): Plugin {
  return {
    name: "vidsave-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url === "/vid/download" && req.method === "POST") {
          try {
            const body = await readBody(req);
            const { url: videoUrl } =
              body as { url?: unknown };

            if (typeof videoUrl !== "string" || !videoUrl.trim()) {
              return sendJson(res, 400, { error: "url is required" });
            }

            const platform = detectPlatform(videoUrl);
            if (!platform) {
              return sendJson(res, 400, {
                error: "Unsupported platform. Please paste a link from TikTok or YouTube.",
              });
            }
            if (platform === "instagram" || platform === "facebook") {
              return sendJson(res, 400, {
                error: `${platform === "instagram" ? "Instagram" : "Facebook"} downloads are not supported yet. Try TikTok or YouTube.`,
              });
            }

            const videoData =
              platform === "tiktok"
                ? await fetchTiktok(videoUrl)
                : await fetchYoutube(videoUrl);

            return sendJson(res, 200, videoData);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[api-plugin] error:", err);
            return sendJson(res, 500, { error: message });
          }
        }
        next();
      });
    },
  };
}
