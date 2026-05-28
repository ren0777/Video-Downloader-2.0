import { Router, type IRouter } from "express";
import { DownloadVideoBody, DownloadVideoResponse } from "@workspace/api-zod";
import { Innertube, Platform as YTPlatform } from "youtubei.js";
import { Readable } from "node:stream";
import { db, downloads, videoCache } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { instagramGetUrl } from "instagram-url-direct";
import getFBInfo from "@renpwn/fb-downloader";

// Provide a Node.js evaluator for youtubei.js to decipher cipher-signed URLs.
YTPlatform.shim.eval = (data: { output: string }, _evalArgs: Record<string, unknown>) => {
  try {
    const fn = new Function(data.output);
    return fn();
  } catch (e) {
    console.error("[player-eval] error:", e);
    throw e;
  }
};

const router: IRouter = Router();

type Platform = "tiktok" | "youtube" | "instagram" | "facebook";

let ytInstance: any = null;

async function getInnertube() {
  if (!ytInstance) {
    ytInstance = await Innertube.create({ retrieve_player: true });
  }
  return ytInstance;
}

function detectPlatform(url: string): Platform | null {
  if (url.includes("tiktok.com") || url.includes("vm.tiktok.com")) return "tiktok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
  return null;
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

  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);
  const details = info.basic_info;
  const streamingData = info.streaming_data;

  if (!streamingData) throw new Error("No streaming data available for this video.");

  const allFormats = [
    ...(streamingData.formats ?? []),
    ...(streamingData.adaptive_formats ?? []),
  ];

  if (allFormats.length === 0) throw new Error("No formats returned for this video.");

  // Sort muxed formats (video+audio) by resolution
  const muxed = allFormats
    .filter((f) => f.has_video && f.has_audio)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));

  const chosen = muxed[0] ?? allFormats[0];

  // Decipher the URL if signature-encrypted
  const downloadUrl = await chosen.decipher(yt.session.player);

  if (!downloadUrl) throw new Error("Could not generate a playable URL for this video.");

  const cover =
    details.thumbnail
      ?.sort((a: any, b: any) => (b.width ?? 0) - (a.width ?? 0))[0]?.url
    ?? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return {
    id: videoId,
    title: details.title || "YouTube Video",
    author: details.author || "Unknown",
    authorAvatar: null,
    cover,
    downloadUrl,
    duration: details.duration ?? 0,
    platform: "youtube" as Platform,
    likes: null,
    comments: null,
    shares: null,
  };
}

async function fetchFacebook(url: string) {
  try {
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

// REST route to trigger file downloading with Express serving as the stream proxy
router.get(["/video/stream", "/stream"], async (req, res): Promise<void> => {
  const { url } = req.query;
  if (typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const platform = detectPlatform(url);
  if (!platform) {
    res.status(400).json({
      error: "Unsupported platform. Please paste a link from TikTok, YouTube, Facebook, or Instagram.",
    });
    return;
  }

  try {
    // YouTube requires special handling — Google CDN blocks bare fetch()
    // so we use youtubei.js's built-in download() which handles auth internally
    if (platform === "youtube") {
      const videoId = extractYouTubeId(url);
      if (!videoId) { res.status(400).json({ error: "Could not extract YouTube video ID." }); return; }

      const yt = await getInnertube();
      const info = await yt.getInfo(videoId);
      const title = info.basic_info.title || "YouTube Video";
      const author = info.basic_info.author || "Unknown";

      const stream = await info.download({
        type: "video+audio",
        quality: "best",
        format: "mp4",
      });

      // Log the download action to the downloads history table (fail-safe)
      try {
        if (db) {
          await db.insert(downloads).values({
            platform: "youtube",
            videoId: videoId,
            title: title,
            author: author,
          });
        }
      } catch (dbErr) {
        req.log.warn({ err: dbErr }, "Failed to log download to database history");
      }

      const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp4"`);
      res.setHeader("Content-Type", "video/mp4");

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
    let author = "unknown";

    if (platform === "tiktok") {
      const data = await fetchTiktok(url);
      downloadUrl = data.downloadUrl;
      title = data.title;
      author = data.author;
    } else if (platform === "facebook") {
      const data = await fetchFacebook(url);
      downloadUrl = data.downloadUrl;
      title = data.title;
      author = data.author;
    } else if (platform === "instagram") {
      const data = await fetchInstagram(url);
      downloadUrl = data.downloadUrl;
      title = data.title;
      author = data.author;
    }

    if (!downloadUrl) {
      res.status(404).json({ error: "Could not resolve stream URL." });
      return;
    }

    const response = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch video stream from CDN." });
      return;
    }

    // Log the download action to the downloads history table (fail-safe)
    try {
      if (db) {
        await db.insert(downloads).values({
          platform: platform,
          videoId: "video_" + Date.now(),
          title: title,
          author: author,
        });
      }
    } catch (dbErr) {
      req.log.warn({ err: dbErr }, "Failed to log download to database history");
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp4"`);
    res.setHeader("Content-Type", "video/mp4");

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    if (response.body) {
      const readable = Readable.fromWeb(response.body as any);
      
      // Cleanup resource if client aborts/disconnects during download
      req.on("close", () => {
        readable.destroy();
      });

      readable.pipe(res);
    } else {
      res.status(500).json({ error: "No stream body found." });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    req.log.error({ err }, "Stream download failed");
    res.status(500).json({ error: message });
  }
});

router.post(["/video/download", "/download"], async (req, res): Promise<void> => {
  const parsed = DownloadVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;
  const platform = detectPlatform(url);

  if (!platform) {
    res.status(400).json({
      error:
        "Unsupported platform. Please paste a link from TikTok, YouTube, Facebook, or Instagram.",
    });
    return;
  }

  // 1. Check videoCache table for cached metadata first (fail-safe)
  let cached = null;
  try {
    if (db) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const results = await db
        .select()
        .from(videoCache)
        .where(
          and(
            eq(videoCache.id, url),
            gt(videoCache.cachedAt, twoHoursAgo)
          )
        )
        .limit(1);
      if (results.length > 0) {
        cached = results[0];
      }
    }
  } catch (dbErr) {
    req.log.warn({ err: dbErr }, "Database cache lookup failed, falling back to direct API fetch");
  }

  if (cached) {
    req.log.info({ url }, "Video metadata retrieved from database cache");
    res.json(DownloadVideoResponse.parse({
      id: cached.id,
      title: cached.title,
      author: cached.author,
      authorAvatar: cached.authorAvatar,
      cover: cached.cover,
      downloadUrl: cached.downloadUrl,
      duration: cached.duration,
      platform: cached.platform as Platform,
      likes: cached.likes,
      comments: cached.comments,
      shares: cached.shares,
    }));
    return;
  }

  try {
    let videoData;
    if (platform === "tiktok") {
      videoData = await fetchTiktok(url);
    } else if (platform === "facebook") {
      videoData = await fetchFacebook(url);
    } else if (platform === "instagram") {
      videoData = await fetchInstagram(url);
    } else {
      videoData = await fetchYoutube(url);
    }

    // 2. Cache the fetched metadata in database (fail-safe)
    try {
      if (db) {
        await db
          .insert(videoCache)
          .values({
            id: url,
            platform: videoData.platform,
            title: videoData.title,
            author: videoData.author,
            authorAvatar: videoData.authorAvatar,
            cover: videoData.cover,
            downloadUrl: videoData.downloadUrl,
            duration: videoData.duration,
            likes: videoData.likes,
            comments: videoData.comments,
            shares: videoData.shares,
            cachedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: videoCache.id,
            set: {
              title: videoData.title,
              author: videoData.author,
              authorAvatar: videoData.authorAvatar,
              cover: videoData.cover,
              downloadUrl: videoData.downloadUrl,
              duration: videoData.duration,
              likes: videoData.likes,
              comments: videoData.comments,
              shares: videoData.shares,
              cachedAt: new Date(),
            },
          });
      }
    } catch (dbErr) {
      req.log.warn({ err: dbErr }, "Failed to write video metadata to database cache");
    }

    res.json(DownloadVideoResponse.parse(videoData));
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    req.log.error({ err }, "Failed to fetch video");
    res.status(500).json({ error: message });
  }
});

export default router;

