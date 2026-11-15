ALTER TABLE ielts_sets ADD COLUMN reading TEXT;
ALTER TABLE ielts_items ADD COLUMN word_family TEXT NOT NULL DEFAULT '';
