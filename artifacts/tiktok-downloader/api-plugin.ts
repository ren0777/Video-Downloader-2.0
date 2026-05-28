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

async function fetchFacebook(url: string) {
  try {
    const { default: getFBInfo } = await import("@renpwn/fb-downloader");
    const result = await getFBInfo(url);
    if (!result || (!result.sd && !result.hd)) {
      throw new Error("No download links found for this Facebook video.");
    }
    
    let videoId = url.match(/[?&]v=([0-9]+)/)?.[1] || url.match(/\/videos\/([0-9]+)/)?.[1] || url.match(/\/reel\/([0-9]+)/)?.[1] || "fb_" + Date.now();

    return {
      id: videoId,
      title: result.title || "Facebook Video",
      author: "Facebook Creator",
      authorAvatar: null,
      cover: result.thumbnail || null,
      downloadUrl: result.hd || result.sd || "",
      duration: 0,
      platform: "facebook" as Platform,
      likes: null,
      comments: null,
      shares: null,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to extract Facebook video. Make sure the link is public.");
  }
}

async function fetchInstagram(url: string) {
  try {
    const { instagramGetUrl } = await import("instagram-url-direct");
    const result = await instagramGetUrl(url);
    if (!result || !result.url_list || result.url_list.length === 0) {
      throw new Error("Could not extract downloadable video link. Make sure the Instagram post/reel is public.");
    }
    
    const downloadUrl = result.url_list[0];
    const idMatch = url.match(/(?:\/p\/|\/reel\/|\/reels\/|\/tv\/)([a-zA-Z0-9_-]+)/);
    const id = idMatch ? idMatch[1] : "ig_" + Date.now();
    
    const postInfo = result.post_info || {};
    const title = postInfo.caption || "Instagram Reel";
    const author = postInfo.owner_fullname || postInfo.owner_username || "Instagram Creator";
    const cover = result.media_details?.[0]?.thumbnail || null;
    const likes = typeof postInfo.likes === "number" ? postInfo.likes : null;

    return {
      id,
      title: title.slice(0, 100) || "Instagram Reel",
      author: author || "Instagram Creator",
      authorAvatar: null,
      cover: cover,
      downloadUrl: downloadUrl,
      duration: 0,
      platform: "instagram" as Platform,
      likes: likes,
      comments: null,
      shares: null,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to parse Instagram URL. Make sure it is a public post or reel.");
  }
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
                error: "Unsupported platform. Please paste a link from TikTok, YouTube, Facebook, or Instagram.",
              });
            }

            let videoData;
            if (platform === "tiktok") {
              videoData = await fetchTiktok(videoUrl);
            } else if (platform === "facebook") {
              videoData = await fetchFacebook(videoUrl);
            } else if (platform === "instagram") {
              videoData = await fetchInstagram(videoUrl);
            } else {
              videoData = await fetchYoutube(videoUrl);
            }

            return sendJson(res, 200, videoData);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[api-plugin] error:", err);
            return sendJson(res, 500, { error: message });
          }
        }

        if (url === "/vid/stream" && req.method === "GET") {
          try {
            const queryUrl = new URL(req.url ?? "", `http://${req.headers.host}`).searchParams.get("url");
            if (!queryUrl || !queryUrl.trim()) {
              return sendJson(res, 400, { error: "url is required" });
            }

            const platform = detectPlatform(queryUrl);
            if (!platform) {
              return sendJson(res, 400, {
                error: "Unsupported platform. Please paste a link from TikTok, YouTube, Facebook, or Instagram.",
              });
            }

            // YouTube requires special handling — Google CDN blocks bare fetch()
            // so we use youtubei.js's built-in download() which handles auth internally
            if (platform === "youtube") {
              const videoId = extractYouTubeId(queryUrl);
              if (!videoId) return sendJson(res, 400, { error: "Could not extract YouTube video ID." });

              const { Innertube, Platform: YTPlatform } = await import("youtubei.js");
              YTPlatform.shim.eval = (data: { output: string }, _evalArgs: Record<string, unknown>) => {
                try {
                  const fn = new Function(data.output);
                  return fn();
                } catch (e) {
                  console.error("[player-eval] error:", e);
                  throw e;
                }
              };

              const yt = await Innertube.create({ retrieve_player: true });
              const info = await yt.getInfo(videoId);
              const title = info.basic_info.title || "YouTube Video";

              const stream = await info.download({
                type: "video+audio",
                quality: "best",
                format: "mp4",
              });

              const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_");
              const headers: Record<string, string> = {
                "Content-Disposition": `attachment; filename="${safeTitle}.mp4"`,
                "Content-Type": "video/mp4",
              };
              res.writeHead(200, headers);

              const { Readable } = await import("node:stream");
              const readable = Readable.fromWeb(stream as any);

              req.on("close", () => {
                readable.destroy();
              });

              readable.pipe(res);
              return;
            }

            // For TikTok, Facebook, Instagram — fetch metadata then proxy CDN URL
            let downloadUrl = "";
            let title = "video";

            if (platform === "tiktok") {
              const data = await fetchTiktok(queryUrl);
              downloadUrl = data.downloadUrl;
              title = data.title;
            } else if (platform === "facebook") {
              const data = await fetchFacebook(queryUrl);
              downloadUrl = data.downloadUrl;
              title = data.title;
            } else if (platform === "instagram") {
              const data = await fetchInstagram(queryUrl);
              downloadUrl = data.downloadUrl;
              title = data.title;
            }

            if (!downloadUrl) {
              return sendJson(res, 404, { error: "Could not resolve stream URL." });
            }

            const response = await fetch(downloadUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });
            if (!response.ok) {
              return sendJson(res, 502, { error: "Failed to fetch video stream from CDN." });
            }

            const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_");
            const cdnHeaders: Record<string, string> = {
              "Content-Disposition": `attachment; filename="${safeTitle}.mp4"`,
              "Content-Type": "video/mp4",
            };
            const contentLength = response.headers.get("content-length");
            if (contentLength) {
              cdnHeaders["Content-Length"] = contentLength;
            }
            res.writeHead(200, cdnHeaders);

            if (response.body) {
              const { Readable } = await import("node:stream");
              const readable = Readable.fromWeb(response.body as any);
              
              req.on("close", () => {
                readable.destroy();
              });

              readable.pipe(res);
              return;
            } else {
              return sendJson(res, 500, { error: "No stream body found." });
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("[api-plugin] stream error:", err);
            return sendJson(res, 500, { error: message });
          }
        }
        next();
      });
    },
  };
}
