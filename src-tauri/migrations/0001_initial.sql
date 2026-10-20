CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    type TEXT NOT NULL CHECK (type IN ('cash','bank','ewallet','other')),
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    opening_balance_date TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    color TEXT,
    icon TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (kind, name)
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense','transfer')),
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    transfer_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    transaction_date TEXT NOT NULL,
    payee TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
        (kind = 'transfer'
            AND transfer_account_id IS NOT NULL
            AND transfer_account_id <> account_id
            AND category_id IS NULL)
        OR
        (kind IN ('income','expense')
            AND transfer_account_id IS NULL
            AND category_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    period TEXT NOT NULL,
    limit_minor INTEGER NOT NULL CHECK (limit_minor > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (category_id, period)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date
    ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_source_date
    ON transactions(account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_dest_date
    ON transactions(transfer_account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_category_date
    ON transactions(category_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_kind_date
    ON transactions(kind, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_budgets_period
    ON budgets(period);

-- Prevent mismatched category kind on transaction inserts/updates.
CREATE TRIGGER IF NOT EXISTS trg_tx_category_kind_insert
BEFORE INSERT ON transactions
WHEN NEW.kind IN ('income','expense')
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) <> NEW.kind
BEGIN
    SELECT RAISE(ABORT, 'category kind does not match transaction kind');
END;

CREATE TRIGGER IF NOT EXISTS trg_tx_category_kind_update
BEFORE UPDATE OF category_id, kind ON transactions
WHEN NEW.kind IN ('income','expense')
  AND (SELECT kind FROM categories WHERE id = NEW.category_id) <> NEW.kind
BEGIN
    SELECT RAISE(ABORT, 'category kind does not match transaction kind');
END;

-- Prevent re-typing a category already used by transactions or budgets.
CREATE TRIGGER IF NOT EXISTS trg_category_kind_protect
BEFORE UPDATE OF kind ON categories
WHEN NEW.kind <> OLD.kind
BEGIN
    SELECT RAISE(ABORT, 'create a new category instead of changing its kind');
END;

-- Budgets may target expense categories only.
CREATE TRIGGER IF NOT EXISTS trg_budget_expense_insert
BEFORE INSERT ON budgets
WHEN (SELECT kind FROM categories WHERE id = NEW.category_id) <> 'expense'
BEGIN
    SELECT RAISE(ABORT, 'budgets require an expense category');
END;

CREATE TRIGGER IF NOT EXISTS trg_budget_expense_update
BEFORE UPDATE OF category_id ON budgets
WHEN (SELECT kind FROM categories WHERE id = NEW.category_id) <> 'expense'
BEGIN
    SELECT RAISE(ABORT, 'budgets require an expense category');
END;

