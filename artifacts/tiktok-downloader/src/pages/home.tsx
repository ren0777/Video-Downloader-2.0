import React, { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import type { VideoResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Download, Search, RefreshCw, PlayCircle, Heart, MessageCircle, Share2, Clock, Trash2, Image as ImageIcon, Zap, Shield, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL").refine(
    (val) => ["tiktok.com", "youtube.com", "youtu.be", "instagram.com", "facebook.com", "fb.watch", "vm.tiktok.com"].some(d => val.includes(d)),
    { message: "Please paste a TikTok, YouTube, Instagram, or Facebook link" }
  ),
});

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "0";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getPlatformStyle(platform: string) {
  switch (platform) {
    case "tiktok": return { bg: "bg-black text-white", label: "TikTok" };
    case "youtube": return { bg: "bg-red-600 text-white", label: "YouTube" };
    case "instagram": return { bg: "bg-gradient-to-r from-purple-500 to-pink-500 text-white", label: "Instagram" };
    case "facebook": return { bg: "bg-blue-600 text-white", label: "Facebook" };
    default: return { bg: "bg-zinc-700 text-white", label: platform };
  }
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const PARTICLE_COUNT = 90;
    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139, 92, 246, ${p.opacity})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    el.style.transform = `perspective(1200px) rotateX(${-dy * 4}deg) rotateY(${dx * 4}deg) scale3d(1.02,1.02,1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ transition: "transform 0.15s ease-out", transformStyle: "preserve-3d" }}
    >
      {children}
    </div>
  );
}

function VideoResultSkeleton() {
  return (
    <div className="w-full max-w-3xl mb-20 animate-pulse duration-1000">
      <div
        className="relative rounded-3xl overflow-hidden border border-white/5"
        style={{
          background: "linear-gradient(135deg, rgba(15,12,30,0.6) 0%, rgba(10,8,25,0.6) 100%)",
          boxShadow: "0 0 40px rgba(124,58,237,0.05), 0 25px 60px rgba(0,0,0,0.4)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="md:flex">
          {/* Cover skeleton */}
          <div className="md:w-[45%] relative aspect-[9/16] md:aspect-auto min-h-[350px] bg-white/5 flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/10 pointer-events-none" />
            <ImageIcon className="w-16 h-16 text-white/5" />
          </div>

          {/* Info skeleton */}
          <div className="md:w-[55%] p-7 md:p-10 flex flex-col justify-between">
            <div>
              {/* Creator row skeleton */}
              <div className="flex items-center gap-4 mb-6">
                <div className="h-11 w-11 rounded-full bg-white/5" />
                <div className="space-y-2">
                  <div className="h-3 w-12 rounded bg-white/5" />
                  <div className="h-4 w-28 rounded bg-white/10" />
                </div>
              </div>

              {/* Title lines skeleton */}
              <div className="space-y-3 mb-8">
                <div className="h-5 w-full rounded bg-white/10" />
                <div className="h-5 w-[90%] rounded bg-white/10" />
                <div className="h-5 w-[60%] rounded bg-white/5" />
              </div>

              {/* Stats block skeleton */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="rounded-2xl p-4 flex flex-col items-center border border-white/5"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <div className="h-4 w-4 rounded-full bg-white/5 mb-2" />
                    <div className="h-5 w-10 rounded bg-white/10 mb-1" />
                    <div className="h-2.5 w-8 rounded bg-white/5" />
                  </div>
                ))}
              </div>
            </div>

            {/* Buttons skeleton */}
            <div className="space-y-3 mt-auto">
              <div className="w-full h-14 rounded-2xl bg-white/10" />
              <div className="w-full h-14 rounded-2xl bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [result, setResult] = useState<VideoResult | null>(null);
  const [history, setHistory] = useState<VideoResult[]>([]);
  const [urlError, setUrlError] = useState("");
  const [activePlatform, setActivePlatform] = useState<"all" | "tiktok" | "youtube" | "instagram" | "facebook">("all");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("");
  const [downloadedSize, setDownloadedSize] = useState("");
  const { toast } = useToast();

  const API_BASE_URL = import.meta.env.DEV
    ? ""
    : (import.meta.env.VITE_API_URL || "https://tiktok-video-downloader-9bem.onrender.com").replace(/\/+$/, "");

  const downloadMutation = useMutation({
    mutationFn: async (url: string): Promise<VideoResult> => {
      const res = await fetch(`${API_BASE_URL}/vid/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data as VideoResult;
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { url: "" },
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vidsave_history");
      if (stored) setHistory(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const addToHistory = (video: VideoResult) => {
    setHistory((prev) => {
      const filtered = prev.filter((v) => v.id !== video.id);
      const updated = [video, ...filtered].slice(0, 5);
      localStorage.setItem("vidsave_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("vidsave_history");
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setUrlError("");
    setResult(null);
    downloadMutation.mutate(values.url, {
      onSuccess: (data) => {
        setResult(data);
        addToHistory(data);
      },
      onError: (error: any) => {
        const message =
          error?.message ||
          "Failed to fetch video details. Please try again.";
        toast({
          title: "Download Failed",
          description: message,
          variant: "destructive",
        });
      },
    });
  };

  const handleReset = () => {
    setResult(null);
    setUrlError("");
    form.reset();
  };

  const getOriginalUrl = (video: VideoResult) => {
    if (video.platform === "youtube") {
      return `https://www.youtube.com/watch?v=${video.id}`;
    }
    if (video.platform === "tiktok") {
      return `https://www.tiktok.com/video/${video.id}`;
    }
    if (video.platform === "instagram") {
      return `https://www.instagram.com/reel/${video.id}/`;
    }
    if (video.platform === "facebook") {
      return `https://www.facebook.com/watch/?v=${video.id}`;
    }
    return video.downloadUrl;
  };

  const handleDownload = async (video: VideoResult) => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadSpeed("Connecting...");
    setDownloadedSize("");

    try {
      const originalUrl = getOriginalUrl(video);
      const streamUrl = `${API_BASE_URL}/vid/stream?url=${encodeURIComponent(originalUrl)}`;
      
      const response = await fetch(streamUrl);
      if (!response.ok) {
        throw new Error(`Failed to download stream: HTTP ${response.status}`);
      }

      const contentLengthHeader = response.headers.get("Content-Length");
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      
      if (!response.body) {
        throw new Error("Response body is not readable");
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      const startTime = Date.now();
      let lastUpdate = startTime;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
        }

        const now = Date.now();
        // Calculate progress percentage
        if (totalBytes > 0) {
          const pct = Math.round((receivedBytes / totalBytes) * 100);
          setDownloadProgress(pct);

          const receivedMB = (receivedBytes / (1024 * 1024)).toFixed(1);
          const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
          setDownloadedSize(`${receivedMB} MB / ${totalMB} MB`);
        } else {
          const receivedMB = (receivedBytes / (1024 * 1024)).toFixed(1);
          setDownloadedSize(`${receivedMB} MB`);
        }

        // Calculate speed over a sliding interval or since start
        if (now - lastUpdate > 300 || receivedBytes === totalBytes) {
          const elapsedSec = (now - startTime) / 1000;
          if (elapsedSec > 0) {
            const speedBytesPerSec = receivedBytes / elapsedSec;
            if (speedBytesPerSec > 1024 * 1024) {
              setDownloadSpeed(`${(speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`);
            } else {
              setDownloadSpeed(`${(speedBytesPerSec / 1024).toFixed(0)} KB/s`);
            }
          }
          lastUpdate = now;
        }
      }

      // Combine chunks into a single Blob
      const blob = new Blob(chunks as any, { type: "video/mp4" });
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Trigger browser download
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeTitle = video.title.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "_");
      a.download = `${safeTitle}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Revoke the blob URL after a short timeout to release memory
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 5000);

      toast({
        title: "Download Complete",
        description: `Successfully downloaded "${video.title}"`,
      });
    } catch (error: any) {
      console.error("Progress download failed:", error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download the video stream.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadSpeed("");
      setDownloadedSize("");
    }
  };

  const watchUrlErrors = form.formState.errors.url?.message;

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#04030a] text-white selection:bg-purple-500/30">
      <ParticleCanvas />

      {/* Aurora orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
        <div className="aurora-orb aurora-orb-1" />
        <div className="aurora-orb aurora-orb-2" />
        <div className="aurora-orb aurora-orb-3" />
        <div className="aurora-orb aurora-orb-4" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 1,
          backgroundImage: `linear-gradient(rgba(139,92,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.03) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center min-h-screen py-20 px-4" style={{ zIndex: 2 }}>
        
        {/* Hero */}
        <div className="text-center mb-16 hero-enter">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm text-purple-300 text-sm font-medium mb-8 animate-pulse-slow">
            <Sparkles className="w-4 h-4" />
            HD · No Watermarks · Free Forever
          </div>

          <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-none">
            <span className="text-white">Vid</span>
            <span className="gradient-text">Save</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-lg mx-auto leading-relaxed mb-10">
            Download any video from TikTok or YouTube in crystal-clear HD — no watermarks, no sign-up, instant.
          </p>

          {/* Platform badges */}
          <div className="flex items-center justify-center gap-3 flex-wrap mb-16">
            {[
              { id: "all", label: "All Platforms", color: "bg-white/5 border-white/10 hover:bg-white/10", activeColor: "bg-purple-600/30 border-purple-500 text-purple-200" },
              { id: "tiktok", label: "TikTok", color: "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-950/60", activeColor: "bg-white/15 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]" },
              { id: "youtube", label: "YouTube", color: "bg-red-950/20 border-red-900/30 hover:bg-red-950/40", activeColor: "bg-red-500/25 border-red-500 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.2)]" },
              { id: "instagram", label: "Instagram", color: "bg-pink-950/20 border-pink-900/30 hover:bg-pink-950/40", activeColor: "bg-pink-500/25 border-pink-500 text-pink-200 shadow-[0_0_15px_rgba(236,72,153,0.2)]" },
              { id: "facebook", label: "Facebook", color: "bg-blue-950/20 border-blue-900/30 hover:bg-blue-950/40", activeColor: "bg-blue-500/25 border-blue-500 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.2)]" },
            ].map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActivePlatform(p.id as any)}
                className={cn(
                  "px-4 py-1.5 rounded-full border text-sm font-semibold transition-all backdrop-blur-sm cursor-pointer select-none active:scale-95",
                  activePlatform === p.id ? p.activeColor : p.color
                )}
                style={{ transition: "all 0.2s" }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Section */}
        {!result && (
          <div className="w-full max-w-2xl mb-20 search-enter">
            <TiltCard className="relative group">
              {/* Animated border */}
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-600 opacity-60 blur-sm group-hover:opacity-100 transition-opacity duration-500 animate-spin-slow" style={{ borderRadius: "18px" }} />
              
              <div className="relative rounded-2xl bg-[#0d0b1a]/95 backdrop-blur-xl border border-white/10 overflow-hidden" style={{ borderRadius: "17px" }}>
                {/* Inner glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-indigo-900/10 pointer-events-none" />
                
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="flex items-center p-2">
                      <div className="flex-shrink-0 pl-4">
                        <Search className="w-5 h-5 text-purple-400/60" />
                      </div>
                      <FormField
                        control={form.control}
                        name="url"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <input
                                placeholder={
                                  activePlatform === "tiktok"
                                    ? "Paste a TikTok video or VM link..."
                                    : activePlatform === "youtube"
                                    ? "Paste a YouTube video, Short, or watch link..."
                                    : activePlatform === "instagram"
                                    ? "Paste an Instagram post or reel link..."
                                    : activePlatform === "facebook"
                                    ? "Paste a Facebook video, reel, or watch link..."
                                    : "Paste a TikTok, YouTube, Instagram, or Facebook link..."
                                }
                                className="w-full bg-transparent border-none outline-none text-white placeholder:text-white/25 px-4 py-5 text-base"
                                autoComplete="off"
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="flex-shrink-0 pr-2">
                        <button
                          type="submit"
                          disabled={downloadMutation.isPending || isDownloading}
                          className="relative overflow-hidden px-7 py-3.5 rounded-xl font-semibold text-white text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95"
                          style={{
                            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                            boxShadow: "0 0 20px rgba(124,58,237,0.5), 0 0 60px rgba(124,58,237,0.15)",
                          }}
                          data-testid="button-submit"
                        >
                          <span className="shimmer-overlay" />
                          {downloadMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Fetching...
                            </span>
                          ) : (
                            "Download"
                          )}
                        </button>
                      </div>
                    </div>
                    {watchUrlErrors && (
                      <div className="px-6 pb-4 text-rose-400 text-sm font-medium animate-in fade-in slide-in-from-top-1">
                        {watchUrlErrors}
                      </div>
                    )}
                  </form>
                </Form>
              </div>
            </TiltCard>

            {/* Stats row */}
            <div className="mt-8 flex items-center justify-center gap-8 text-center">
              {[
                { icon: <Zap className="w-4 h-4 text-yellow-400" />, label: "Instant", sub: "No waiting" },
                { icon: <Shield className="w-4 h-4 text-emerald-400" />, label: "Watermark-free", sub: "Always clean" },
                { icon: <Sparkles className="w-4 h-4 text-purple-400" />, label: "HD Quality", sub: "Full resolution" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white/80">
                    {s.icon}
                    {s.label}
                  </div>
                  <span className="text-xs text-white/30">{s.sub}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {downloadMutation.isPending && <VideoResultSkeleton />}

        {/* Result Card */}
        {result && (
          <div className="w-full max-w-3xl mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div
              className="relative rounded-3xl overflow-hidden border border-white/10"
              style={{
                background: "linear-gradient(135deg, rgba(15,12,30,0.98) 0%, rgba(10,8,25,0.98) 100%)",
                boxShadow: "0 0 80px rgba(124,58,237,0.15), 0 25px 60px rgba(0,0,0,0.6)",
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />

              <div className="md:flex">
                {/* Cover */}
                <div className="md:w-[45%] relative aspect-[9/16] md:aspect-auto min-h-[300px] overflow-hidden">
                  {result.cover ? (
                    <img
                      src={result.cover}
                      alt={result.title}
                      className="absolute inset-0 w-full h-full object-cover"
                      data-testid="img-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[#0a0818] flex items-center justify-center">
                      <ImageIcon className="w-16 h-16 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0818]/80 hidden md:block" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0818] via-transparent to-transparent md:hidden" />

                  {/* Duration badge */}
                  <div className="absolute bottom-4 left-4">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-sm font-medium">
                      <Clock className="w-3.5 h-3.5 text-purple-400" />
                      {formatDuration(result.duration)}
                    </div>
                  </div>

                  {/* Platform badge */}
                  <div className="absolute top-4 left-4">
                    <span className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", getPlatformStyle(result.platform).bg)}>
                      {getPlatformStyle(result.platform).label}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="md:w-[55%] p-7 md:p-10 flex flex-col">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="relative">
                      <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 opacity-60 blur-[2px]" />
                      <Avatar className="relative h-11 w-11 border-2 border-white/10">
                        {result.authorAvatar && <AvatarImage src={result.authorAvatar} />}
                        <AvatarFallback className="bg-purple-900/50 text-purple-300 font-bold">
                          {result.author.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="text-xs text-white/30 uppercase tracking-widest font-semibold mb-0.5">Creator</p>
                      <p className="text-base font-bold text-white" data-testid="text-author">@{result.author}</p>
                    </div>
                  </div>

                  <h2 className="text-xl md:text-2xl font-semibold mb-7 line-clamp-3 text-white/90 leading-snug" data-testid="text-title">
                    {result.title}
                  </h2>

                  {(result.likes != null || result.comments != null || result.shares != null) && (
                    <div className="grid grid-cols-3 gap-3 mb-8">
                      {[
                        { icon: <Heart className="w-4 h-4 text-rose-400" />, val: result.likes, label: "Likes" },
                        { icon: <MessageCircle className="w-4 h-4 text-sky-400" />, val: result.comments, label: "Comments" },
                        { icon: <Share2 className="w-4 h-4 text-emerald-400" />, val: result.shares, label: "Shares" },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="rounded-2xl p-4 flex flex-col items-center border border-white/5"
                          style={{ background: "rgba(255,255,255,0.03)" }}
                        >
                          {stat.icon}
                          <span className="font-bold text-lg mt-2 text-white">{formatNumber(stat.val)}</span>
                          <span className="text-[10px] text-white/30 uppercase tracking-wider mt-1">{stat.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto space-y-3">
                    {isDownloading ? (
                      <div className="space-y-3.5 p-5 rounded-2xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-xl relative overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.1)] animate-in fade-in zoom-in-95 duration-300">
                        {/* Top glow line */}
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
                        
                        <div className="flex justify-between items-center text-sm font-semibold">
                          <span className="flex items-center gap-2 text-purple-300">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                            Downloading HD Video...
                          </span>
                          <span className="text-purple-400 font-bold tracking-wider">{downloadProgress}%</span>
                        </div>

                        {/* Progress bar container */}
                        <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                          <div 
                            className="h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>

                        <div className="flex justify-between items-center text-xs text-white/40">
                          <span>{downloadedSize}</span>
                          <span className="font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-purple-300">{downloadSpeed}</span>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="w-full py-4 rounded-2xl font-bold text-white text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] relative overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                          boxShadow: "0 0 30px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.3)",
                        }}
                        onClick={() => handleDownload(result)}
                        data-testid="button-download"
                      >
                        <span className="shimmer-overlay" />
                        <Download className="w-5 h-5" />
                        Download HD Video
                      </button>
                    )}
                    <button
                      className="w-full py-4 rounded-2xl font-semibold text-white/50 hover:text-white/80 disabled:hover:text-white/50 text-sm flex items-center justify-center gap-2 transition-colors border border-white/5 hover:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                      onClick={handleReset}
                      disabled={isDownloading}
                      data-testid="button-reset"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Download Another
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && !result && (
          <div className="w-full max-w-2xl animate-in fade-in duration-700">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white/60 uppercase tracking-widest">Recent Downloads</h3>
              <button
                onClick={clearHistory}
                className="flex items-center gap-1.5 text-sm text-white/30 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {history.map((item, i) => (
                <div
                  key={`${item.id}-${i}`}
                  className="group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer border border-white/8 hover:border-purple-500/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                  onClick={() => handleDownload(item)}
                  data-testid={`card-history-${item.id}`}
                >
                  {item.cover ? (
                    <img src={item.cover} alt={item.title} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-white/10" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="p-2.5 rounded-full bg-purple-600/80 backdrop-blur-sm">
                      <Download className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-2.5">
                    <p className="text-[10px] font-medium text-white line-clamp-2 leading-tight mb-1">{item.title}</p>
                    <p className="text-[9px] text-white/40 truncate">@{item.author}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-20 text-center">
          <p className="text-xs text-white/15">VidSave · For personal use only · Respect creators&apos; rights</p>
        </div>
      </div>

      <style>{`
        .gradient-text {
          background: linear-gradient(135deg, #a855f7, #7c3aed, #6366f1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .aurora-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .aurora-orb-1 {
          width: 600px; height: 600px;
          top: -150px; left: -100px;
          background: radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%);
          animation: aurora-drift-1 22s ease-in-out infinite alternate;
        }
        .aurora-orb-2 {
          width: 500px; height: 500px;
          top: 20%; right: -100px;
          background: radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%);
          animation: aurora-drift-2 28s ease-in-out infinite alternate;
        }
        .aurora-orb-3 {
          width: 700px; height: 400px;
          bottom: 10%; left: 10%;
          background: radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%);
          animation: aurora-drift-3 35s ease-in-out infinite alternate;
        }
        .aurora-orb-4 {
          width: 400px; height: 400px;
          bottom: -100px; right: 20%;
          background: radial-gradient(circle, rgba(167,139,250,0.1) 0%, transparent 70%);
          animation: aurora-drift-4 18s ease-in-out infinite alternate;
        }

        @keyframes aurora-drift-1 {
          0%   { transform: translate(0px, 0px) scale(1); }
          100% { transform: translate(120px, 80px) scale(1.15); }
        }
        @keyframes aurora-drift-2 {
          0%   { transform: translate(0px, 0px) scale(1); }
          100% { transform: translate(-80px, 120px) scale(1.1); }
        }
        @keyframes aurora-drift-3 {
          0%   { transform: translate(0px, 0px) scale(1); }
          100% { transform: translate(60px, -100px) scale(1.2); }
        }
        @keyframes aurora-drift-4 {
          0%   { transform: translate(0px, 0px) scale(1); }
          100% { transform: translate(-100px, -60px) scale(1.08); }
        }

        .hero-enter {
          animation: hero-in 1s cubic-bezier(0.16,1,0.3,1) both;
        }
        .search-enter {
          animation: hero-in 1s cubic-bezier(0.16,1,0.3,1) 0.2s both;
        }
        @keyframes hero-in {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0px); }
        }

        .badge-float {
          animation: badge-float 3s ease-in-out infinite;
        }
        @keyframes badge-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-4px); }
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        .animate-pulse-slow {
          animation: pulse-glow 2.5s ease-in-out infinite;
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.7; box-shadow: 0 0 12px rgba(139,92,246,0.2); }
          50%       { opacity: 1;   box-shadow: 0 0 24px rgba(139,92,246,0.5); }
        }

        .shimmer-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%);
          background-size: 200% 100%;
          animation: shimmer 2.5s linear infinite;
        }
        @keyframes shimmer {
          from { background-position: 200% center; }
          to   { background-position: -200% center; }
        }
      `}</style>
    </div>
  );
}
