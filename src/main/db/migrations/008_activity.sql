-- 新增记录不回填历史字数或学习时长。
CREATE TABLE activity_tracking (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at INTEGER NOT NULL
);
INSERT INTO activity_tracking VALUES (1, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- 不关联笔记外键，删除笔记仍保留已发生的写作活动。
CREATE TABLE note_writing_daily (
  date TEXT NOT NULL,
  note_id TEXT NOT NULL,
  baseline_words INTEGER NOT NULL,
  peak_words INTEGER NOT NULL,
  PRIMARY KEY (date, note_id)
);
CREATE TABLE ielts_study_daily (
  date TEXT PRIMARY KEY,
  milliseconds INTEGER NOT NULL DEFAULT 0 CHECK (milliseconds >= 0)
);
CREATE INDEX idx_todos_done_at ON todos(done_at) WHERE done = 1;
CREATE INDEX idx_habit_logs_date ON habit_logs(date);
