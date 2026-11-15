CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  event_time TEXT,
  content TEXT NOT NULL,
  image_files TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_memories_timeline ON memories(event_date DESC, event_time DESC, created_at DESC, id DESC);
