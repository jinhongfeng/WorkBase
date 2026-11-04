PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);

CREATE TABLE notes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',        -- 逗号分隔，前置逗号便于 LIKE 匹配
  pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content='notes', content_rowid='rowid', tokenize='unicode61');

CREATE TABLE todos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2,  -- 1 高 2 中 3 低
  due_date TEXT, done INTEGER NOT NULL DEFAULT 0, done_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
