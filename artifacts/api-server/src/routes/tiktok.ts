import { Router, type IRouter } from "express";
import { DownloadTiktokBody, DownloadTiktokResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/tiktok/download", async (req, res): Promise<void> => {
  const parsed = DownloadTiktokBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url } = parsed.data;

  if (!url || !url.includes("tiktok.com")) {
    res.status(400).json({ error: "Please provide a valid TikTok URL" });
    return;
  }

  try {
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

    if (!response.ok) {
      req.log.error({ status: response.status }, "tikwm API error");
      res.status(500).json({ error: "Failed to fetch video from TikTok" });
      return;
    }

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
        author: {
          nickname: string;
          avatar: string;
        };
        digg_count: number;
        comment_count: number;
        share_count: number;
      };
    };

    if (data.code !== 0 || !data.data) {
      req.log.warn({ msg: data.msg }, "tikwm returned error");
      res.status(400).json({ error: data.msg || "Could not process this TikTok URL" });
      return;
    }

    const video = data.data;

    const result = DownloadTiktokResponse.parse({
      id: video.id,
      title: video.title || "TikTok Video",
      author: video.author?.nickname || "Unknown",
      authorAvatar: video.author?.avatar || "",
      cover: video.cover || "",
      downloadUrl: video.hdplay || video.play || "",
      duration: video.duration || 0,
      likes: video.digg_count || 0,
      comments: video.comment_count || 0,
      shares: video.share_count || 0,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Unexpected error fetching TikTok video");
    res.status(500).json({ error: "An unexpected error occurred. Please try again." });
  }
});

export default router;
