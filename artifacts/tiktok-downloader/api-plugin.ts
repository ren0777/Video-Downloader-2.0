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

async function fetchYoutube(url: string) {
  const ytdl = await import("@distube/ytdl-core");
  const info = await ytdl.default.getInfo(url);
  const details = info.videoDetails;

  // Try progressively looser format criteria until one works
  let format =
    ytdl.default.chooseFormat(info.formats, { quality: "highestvideo", filter: "videoandaudio" }) ||
    ytdl.default.chooseFormat(info.formats, { quality: "highest", filter: "videoandaudio" }) ||
    ytdl.default.chooseFormat(info.formats, { filter: "videoandaudio" }) ||
    ytdl.default.chooseFormat(info.formats, { quality: "highestvideo" }) ||
    ytdl.default.chooseFormat(info.formats, { quality: "highest" }) ||
    info.formats.find((f) => f.url) ||
    null;

  if (!format?.url) {
    throw new Error("Could not find a downloadable format for this YouTube video.");
  }

  const cover =
    details.thumbnails?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

  return {
    id: details.videoId,
    title: details.title || "YouTube Video",
    author: details.author?.name || "Unknown",
    authorAvatar: null as null,
    cover,
    downloadUrl: format.url,
    duration: parseInt(details.lengthSeconds, 10) || 0,
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
            const message = err instanceof Error ? err.message : "An unexpected error occurred";
            console.error("[api-plugin] error:", message);
            return sendJson(res, 500, { error: message });
          }
        }
        next();
      });
    },
  };
}
