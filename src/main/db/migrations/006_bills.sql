CREATE TABLE bill_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('email', 'file')),
  file_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE bill_txns (
  fingerprint TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES bill_imports(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
);
CREATE INDEX idx_bill_ts ON bill_txns(ts DESC);
CREATE INDEX idx_bill_cat ON bill_txns(category);
