CREATE TABLE daily_briefs (
  issue_date TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  synced_at INTEGER NOT NULL
);
