import { Router, type IRouter } from "express";
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

  if (!response.ok) throw new Error("tikwm API error");

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
    throw new Error(data.msg || "Could not process this TikTok URL");
  }

  const v = data.data;
  return {
    id: v.id,
    title: v.title || "TikTok Video",
    author: v.author?.nickname || "Unknown",
    authorAvatar: v.author?.avatar || null,
    cover: v.cover || null,
    downloadUrl: v.hdplay || v.play || "",
    duration: v.duration || 0,
    platform: "tiktok" as Platform,
    likes: v.digg_count || 0,
    comments: v.comment_count || 0,
    shares: v.share_count || 0,
  };
}

async function fetchViaCobalt(url: string, platform: Platform) {
  const cobaltResponse = await fetch("https://api.cobalt.tools/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url,
      videoQuality: "max",
      filenameStyle: "pretty",
    }),
  });

  if (!cobaltResponse.ok) {
    const text = await cobaltResponse.text();
    throw new Error(`Cobalt API error ${cobaltResponse.status}: ${text.slice(0, 200)}`);
  }

  const cobalt = (await cobaltResponse.json()) as {
    status: string;
    url?: string;
    error?: { code?: string };
  };

  if (!cobalt.url) {
    throw new Error(cobalt.error?.code || "Could not extract download URL");
  }

  let title = "Video";
  let cover: string | null = null;
  let author = "Unknown";
  let duration = 0;

  if (platform === "youtube") {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      if (oembed.ok) {
        const meta = (await oembed.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        title = meta.title || title;
        author = meta.author_name || author;
        cover = meta.thumbnail_url || null;
      }
    } catch {
      // metadata is best-effort
    }
  }

  return {
    id: generateId(url),
    title,
    author,
    authorAvatar: null,
    cover,
    downloadUrl: cobalt.url,
    duration,
    platform,
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
      error: "Unsupported platform. Please use a TikTok, YouTube, Instagram, or Facebook link.",
    });
    return;
  }

  try {
    const videoData =
      platform === "tiktok"
        ? await fetchTiktok(url)
        : await fetchViaCobalt(url, platform);

    res.json(DownloadVideoResponse.parse(videoData));
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    req.log.error({ err }, "Failed to fetch video");
    res.status(500).json({ error: message });
  }
});

export default router;
