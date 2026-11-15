-- RSS 订阅：用户自行配置的源与条目缓存；删除源时级联删除条目。
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fetch_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE source_entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  published_at INTEGER,
  summary TEXT NOT NULL DEFAULT '',
  fetched_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, guid)
);
CREATE INDEX idx_source_entries_source ON source_entries(source_id, published_at DESC);
