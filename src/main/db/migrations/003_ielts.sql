-- 雅思学习：学习包 + 学习项 + 复习记录
CREATE TABLE IF NOT EXISTS ielts_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT '6.5',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ielts_items (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL REFERENCES ielts_sets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'word',
  term TEXT NOT NULL,
  phonetic TEXT NOT NULL DEFAULT '',
  pos TEXT NOT NULL DEFAULT '',
  meaning TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL DEFAULT '',
  collocation TEXT NOT NULL DEFAULT '',
  band TEXT NOT NULL DEFAULT '',
  mastery INTEGER NOT NULL DEFAULT 0,
  wrong INTEGER NOT NULL DEFAULT 0,
  review_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ielts_items_set ON ielts_items(set_id);
CREATE INDEX IF NOT EXISTS idx_ielts_items_review ON ielts_items(review_at);

CREATE TABLE IF NOT EXISTS ielts_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES ielts_items(id) ON DELETE CASCADE,
  known INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ielts_reviews_time ON ielts_reviews(reviewed_at DESC);
