import { Router, type IRouter } from "express";
import ytdl from "@distube/ytdl-core";
import { DownloadVideoBody, DownloadVideoResponse } from "@workspace/api-zod";

const router: IRouter = Router();

type Platform = "tiktok" | "youtube" | "instagram" | "facebook";

function detectPlatform(url: string): Platform | null {
  if (url.includes("tiktok.com") || url.includes("vm.tiktok.com")) return "tiktok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("instagram.com")) return "instagram";
  if (url.includes("facebook.com") || url.includes("fb.watch")) return "facebook";
  return null;
}

function generateId(url: string): string {
  return Buffer.from(url).toString("base64").slice(0, 16).replace(/[/+=]/g, "x");
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
  const info = await ytdl.getInfo(url);
  const details = info.videoDetails;

  const format = ytdl.chooseFormat(info.formats, {
    quality: "highestvideo",
    filter: "videoandaudio",
  });

  const cover =
    details.thumbnails?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? null;

  return {
    id: details.videoId,
    title: details.title || "YouTube Video",
    author: details.author?.name || "Unknown",
    authorAvatar: null,
    cover,
    downloadUrl: format?.url || "",
    duration: parseInt(details.lengthSeconds, 10) || 0,
    platform: "youtube" as Platform,
    likes: null,
    comments: null,
    shares: null,
  };
}

router.post("/video/download", async (req, res): Promise<void> => {
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
        "Unsupported platform. Please paste a link from TikTok or YouTube.",
    });
    return;
  }

  if (platform === "instagram" || platform === "facebook") {
    res.status(400).json({
      error: `${platform === "instagram" ? "Instagram" : "Facebook"} downloads are not supported yet. Try TikTok or YouTube.`,
    });
    return;
  }

  try {
    const videoData =
      platform === "tiktok" ? await fetchTiktok(url) : await fetchYoutube(url);

    res.json(DownloadVideoResponse.parse(videoData));
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    req.log.error({ err }, "Failed to fetch video");
    res.status(500).json({ error: message });
  }
});

export default router;
