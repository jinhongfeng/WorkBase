-- 书影音记录：本地手动录入的书、电影与剧集收藏，封面落 files/shelf-covers/。
CREATE TABLE shelf_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('book', 'movie', 'tv')),
  title TEXT NOT NULL,
  creator TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'wish' CHECK(status IN ('wish', 'doing', 'done')),
  rating INTEGER CHECK(rating IS NULL OR (rating BETWEEN 0 AND 5)),
  comment TEXT NOT NULL DEFAULT '',
  cover_file TEXT,
  start_date TEXT,
  finish_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_shelf_updated ON shelf_items(updated_at DESC);
