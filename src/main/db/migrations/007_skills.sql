CREATE TABLE skills (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,                -- 包目录名，唯一
  description  TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',     -- SKILL.md 正文（不含 frontmatter）
  frontmatter  TEXT NOT NULL DEFAULT '',     -- frontmatter 原文，回写时逐行保留未知字段
  tags         TEXT NOT NULL DEFAULT '',     -- 形如 ',写作,翻译,'，便于 LIKE 精确匹配
  source       TEXT NOT NULL DEFAULT 'manual', -- manual|import_zip|import_dir|import_md|duplicate
  source_ref   TEXT NOT NULL DEFAULT '',     -- 原始 zip 文件名 / 目录名 / 文件名
  layout       TEXT NOT NULL DEFAULT 'dir',  -- 原始形态：dir（目录+SKILL.md）| file（单文件）
  cover_kind   TEXT NOT NULL DEFAULT 'none', -- none|image|video
  cover_path   TEXT NOT NULL DEFAULT '',     -- files/skill-covers/<name> 的文件名
  cover_remote TEXT NOT NULL DEFAULT '',     -- 外链原始 URL，仅留档
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_skills_slug ON skills(slug);
CREATE INDEX idx_skills_updated ON skills(updated_at DESC);
CREATE INDEX idx_skills_pinned ON skills(pinned DESC, updated_at DESC);

CREATE TABLE skill_files (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  path     TEXT NOT NULL,   -- 相对包目录
  size     INTEGER NOT NULL,
  UNIQUE(skill_id, path)
);
