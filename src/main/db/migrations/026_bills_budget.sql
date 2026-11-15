-- 账单预算与分类规则：预算按北京时间自然月叠加在只读交易之上；
-- 分类规则按交易对方关键字匹配（LIKE %pattern%），导入时与手动重灌时生效。
CREATE TABLE bill_budgets (
  month TEXT PRIMARY KEY,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  updated_at INTEGER NOT NULL
);
CREATE TABLE bill_rules (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
