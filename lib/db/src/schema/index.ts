import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const downloads = pgTable("downloads", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  videoId: text("video_id").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
});

export const videoCache = pgTable("video_cache", {
  id: text("id").primaryKey(), // Using the video URL or ID
  platform: text("platform").notNull(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  authorAvatar: text("author_avatar"),
  cover: text("cover"),
  downloadUrl: text("download_url").notNull(),
  duration: integer("duration").notNull(),
  likes: integer("likes"),
  comments: integer("comments"),
  shares: integer("shares"),
  cachedAt: timestamp("cached_at").defaultNow().notNull(),
});