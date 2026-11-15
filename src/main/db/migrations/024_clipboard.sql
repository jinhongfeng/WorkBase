-- 剪贴板历史：仅文本，置顶项不参与清空与容量淘汰。
CREATE TABLE clipboard_items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_clipboard_recent ON clipboard_items(pinned DESC, updated_at DESC);
