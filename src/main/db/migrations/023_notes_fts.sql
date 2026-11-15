-- 启用笔记全文检索。001 的 notes_fts 一直「已建未用」（无触发器、检索走 LIKE）。
-- unicode61 不切分中文，这里重建为 trigram 分词：支持中文与任意文本的子串匹配。
-- 表内此前无数据（从未写入），重建安全；rebuild 从 notes 全量回填。
DROP TABLE IF EXISTS notes_fts;
CREATE VIRTUAL TABLE notes_fts USING fts5(title, content, content='notes', content_rowid='rowid', tokenize='trigram');

-- 外部内容表的同步触发器：delete 命令必须携带旧值。
CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER notes_fts_update AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');
