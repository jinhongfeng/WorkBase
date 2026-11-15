CREATE TABLE media_groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

ALTER TABLE media_items ADD COLUMN group_id TEXT REFERENCES media_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_media_group_created ON media_items(group_id, created_at DESC);
