ALTER TABLE media_items ADD COLUMN content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE media_items ADD COLUMN visual_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_media_content_hash ON media_items(content_hash);
CREATE INDEX idx_media_visual_hash ON media_items(visual_hash);
