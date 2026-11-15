CREATE TABLE english_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at INTEGER,
  paragraphs TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
