CREATE TABLE note_folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE skill_folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL;
ALTER TABLE skills ADD COLUMN folder_id TEXT REFERENCES skill_folders(id) ON DELETE SET NULL;

CREATE INDEX idx_notes_folder ON notes(folder_id);
CREATE INDEX idx_skills_folder ON skills(folder_id);

-- The old Skill filter used comma-separated tags, including leading and trailing commas.
INSERT OR IGNORE INTO skill_folders (id, name)
SELECT lower(hex(randomblob(16))), name
FROM (
  SELECT DISTINCT trim(tag.value) COLLATE NOCASE AS name
  FROM skills AS skill, json_each('[' || replace(json_quote(skill.tags), ',', '","') || ']') AS tag
  WHERE trim(tag.value) <> ''
  ORDER BY name
);

UPDATE skills AS skill
SET folder_id = (
  SELECT folder.id
  FROM json_each('[' || replace(json_quote(skill.tags), ',', '","') || ']') AS tag
  JOIN skill_folders AS folder ON folder.name = trim(tag.value)
  ORDER BY tag.key
  LIMIT 1
)
WHERE skill.tags <> '';
