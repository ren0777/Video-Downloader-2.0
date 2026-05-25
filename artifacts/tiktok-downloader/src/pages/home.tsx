import React, { useState, useEffect } from "react";
import { useDownloadTiktok } from "@workspace/api-client-react";
import type { TiktokVideo } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download, Search, RefreshCw, PlayCircle, Heart, MessageCircle, Share2, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL").includes("tiktok.com", { message: "Must be a TikTok URL" }),
});

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [result, setResult] = useState<TiktokVideo | null>(null);
  const [history, setHistory] = useState<TiktokVideo[]>([]);
  const { toast } = useToast();

  const downloadMutation = useDownloadTiktok();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
    },
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem("tiksave_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }, []);

  const addToHistory = (video: TiktokVideo) => {
    setHistory((prev) => {
      const filtered = prev.filter((v) => v.id !== video.id);
      const updated = [video, ...filtered].slice(0, 5);
      localStorage.setItem("tiksave_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("tiksave_history");
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    setResult(null);
    downloadMutation.mutate(
      { data: { url: values.url } },
      {
        onSuccess: (data) => {
          setResult(data);
          addToHistory(data);
        },
        onError: (error: any) => {
          toast({
            title: "Download Failed",
            description: error?.response?.data?.error || "Failed to fetch video details. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleReset = () => {
    setResult(null);
    form.reset();
  };

  const handleDownload = (video: TiktokVideo) => {
    window.open(video.downloadUrl, "_blank");
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-background py-16 px-4 sm:px-6 lg:px-8 selection:bg-primary/30">
      
      <div className="w-full max-w-3xl space-y-12">
        {/* Header */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-flex items-center justify-center p-2 bg-primary/10 rounded-2xl mb-4">
            <PlayCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight lg:text-6xl">
            Tik<span className="text-primary">Save</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Download TikTok videos in high definition without watermarks. Fast, free, and secure.
          </p>
        </div>

        {/* Input Section */}
        {!result && (
          <div className="animate-in fade-in zoom-in-95 duration-500 delay-150 fill-mode-both">
            <Card className="border-border/50 shadow-2xl bg-card/50 backdrop-blur-sm overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
              <CardContent className="p-2 sm:p-4">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex items-center">
                    <Search className="absolute left-4 w-5 h-5 text-muted-foreground" />
                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormControl>
                            <Input 
                              placeholder="Paste TikTok link here..." 
                              className="w-full pl-12 pr-32 py-8 text-lg bg-transparent border-none shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50 rounded-xl"
                              autoComplete="off"
                              {...field} 
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <div className="absolute right-2">
                      <Button 
                        type="submit" 
                        size="lg" 
                        className="rounded-xl px-8 h-12 text-base shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all active:scale-95"
                        disabled={downloadMutation.isPending}
                        data-testid="button-submit"
                      >
                        {downloadMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          "Download"
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
                {form.formState.errors.url && (
                  <p className="text-destructive text-sm mt-2 px-4 font-medium animate-in fade-in slide-in-from-top-1">
                    {form.formState.errors.url.message}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Result Section */}
        {result && (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            <Card className="border-border shadow-2xl overflow-hidden bg-card/80 backdrop-blur-xl">
              <div className="md:flex">
                <div className="md:w-2/5 relative bg-black/50 aspect-[9/16] md:aspect-auto">
                  <img 
                    src={result.cover} 
                    alt={result.title} 
                    className="w-full h-full object-cover opacity-80"
                    data-testid="img-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                      <Clock className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-white">{formatDuration(result.duration)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="md:w-3/5 p-6 md:p-8 flex flex-col">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarImage src={result.authorAvatar} />
                      <AvatarFallback className="bg-primary/20 text-primary">{result.author.substring(0,2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Creator</p>
                      <p className="text-lg font-bold text-foreground" data-testid="text-author">@{result.author}</p>
                    </div>
                  </div>
                  
                  <h2 className="text-xl md:text-2xl font-semibold mb-6 line-clamp-3 text-foreground/90" data-testid="text-title">
                    {result.title}
                  </h2>
                  
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-secondary/50 rounded-xl p-4 flex flex-col items-center justify-center border border-border/50">
                      <Heart className="w-5 h-5 text-rose-500 mb-2" />
                      <span className="font-bold text-lg">{formatNumber(result.likes)}</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Likes</span>
                    </div>
                    <div className="bg-secondary/50 rounded-xl p-4 flex flex-col items-center justify-center border border-border/50">
                      <MessageCircle className="w-5 h-5 text-blue-400 mb-2" />
                      <span className="font-bold text-lg">{formatNumber(result.comments)}</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Comments</span>
                    </div>
                    <div className="bg-secondary/50 rounded-xl p-4 flex flex-col items-center justify-center border border-border/50">
                      <Share2 className="w-5 h-5 text-emerald-400 mb-2" />
                      <span className="font-bold text-lg">{formatNumber(result.shares)}</span>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Shares</span>
                    </div>
                  </div>
                  
                  <div className="mt-auto space-y-4">
                    <Button 
                      size="lg" 
                      className="w-full h-14 text-lg font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                      onClick={() => handleDownload(result)}
                      data-testid="button-download"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Download HD Video
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="lg" 
                      className="w-full h-14 text-muted-foreground hover:text-foreground rounded-xl"
                      onClick={handleReset}
                      data-testid="button-reset"
                    >
                      <RefreshCw className="mr-2 h-5 w-5" />
                      Download Another
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* History Section */}
        {history.length > 0 && !result && (
          <div className="pt-8 animate-in fade-in duration-700 delay-300 fill-mode-both">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Recent Downloads</h3>
              <Button variant="ghost" size="sm" onClick={clearHistory} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear History
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {history.map((item, i) => (
                <div 
                  key={`${item.id}-${i}`}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer border border-border/50 bg-card hover:border-primary/50 transition-colors"
                  onClick={() => handleDownload(item)}
                  data-testid={`card-history-${item.id}`}
                >
                  <img src={item.cover} alt={item.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                    <Download className="w-8 h-8 text-white drop-shadow-md" />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-xs font-medium text-white line-clamp-2 drop-shadow-md">{item.title}</p>
                    <p className="text-[10px] text-white/70 mt-1 truncate">@{item.author}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
