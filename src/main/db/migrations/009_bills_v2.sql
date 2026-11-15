-- Keep this additive migration free of column CHECK constraints and table rebuilds.
-- The CSV parser normalizes direction to income/expense; legacy rows default to expense.
ALTER TABLE bill_txns ADD COLUMN direction TEXT NOT NULL DEFAULT 'expense';
ALTER TABLE bill_txns ADD COLUMN counterparty TEXT NOT NULL DEFAULT '';
