-- 笔记：区分普通笔记与日记，并新增本地密钥表（值由 safeStorage 加密后以 base64 存储）
ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE notes ADD COLUMN journal_date TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_journal_date ON notes(journal_date) WHERE journal_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
