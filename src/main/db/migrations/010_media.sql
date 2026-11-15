CREATE TABLE media_items (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('image', 'video')),
  source        TEXT NOT NULL CHECK (source IN ('local', 'url')),
  name          TEXT NOT NULL DEFAULT '',
  file_name     TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  original_url  TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  size          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_media_created ON media_items(created_at DESC);
CREATE INDEX idx_media_type ON media_items(type);
