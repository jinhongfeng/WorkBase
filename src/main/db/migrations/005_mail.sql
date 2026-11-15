CREATE TABLE mail_accounts (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL,
  secure INTEGER NOT NULL DEFAULT 1, username TEXT NOT NULL,
  secret BLOB NOT NULL,                 -- safeStorage 密文
  mailbox TEXT NOT NULL DEFAULT 'INBOX', sync_days INTEGER NOT NULL DEFAULT 30,
  enabled INTEGER NOT NULL DEFAULT 1, last_sync_at INTEGER, last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE mails (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  uid INTEGER NOT NULL, folder TEXT NOT NULL DEFAULT 'INBOX',
  message_id TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', from_name TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '', to_addrs TEXT NOT NULL DEFAULT '',
  sent_at INTEGER NOT NULL, snippet TEXT NOT NULL DEFAULT '', text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT, size INTEGER NOT NULL DEFAULT 0, has_attachment INTEGER NOT NULL DEFAULT 0,
  read INTEGER NOT NULL DEFAULT 0, fetched_at INTEGER NOT NULL,
  UNIQUE(account_id, folder, uid)
);
CREATE INDEX idx_mails_sent ON mails(sent_at DESC);
CREATE INDEX idx_mails_from ON mails(from_addr);
