ALTER TABLE transactions ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_tx_active_date ON transactions(deleted_at, transaction_date DESC);
