use crate::{
    domain,
    error::{AppError, Result},
    models::*,
};
use chrono::Utc;
use sqlx::{
    Row, SqliteConnection, SqlitePool,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use uuid::Uuid;

pub struct Store {
    pub pool: SqlitePool,
    pub(crate) path: PathBuf,
    pub(crate) restore_candidate: Mutex<Option<crate::recovery::Candidate>>,
}

impl Store {
    pub async fn open(path: &Path) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|_| AppError::storage())?;
        let store = Self {
            pool,
            path: path.to_path_buf(),
            restore_candidate: Mutex::new(None),
        };
        store.seed().await?;
        Ok(store)
    }

    async fn seed(&self) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let existing: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM settings WHERE key='seedVersion'")
                .fetch_one(&mut *tx)
                .await?;
        if existing > 0 {
            return Ok(());
        }
        let populated: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM categories")
            .fetch_one(&mut *tx)
            .await?;
        if populated > 0 {
            sqlx::query("INSERT INTO settings VALUES ('seedVersion','1')")
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
            return Ok(());
        }
        let now = Utc::now().to_rfc3339();
        for (kind, names) in [
            (
                "income",
                &["Salary", "Freelance", "Gifts", "Other Income"][..],
            ),
            (
                "expense",
                &[
                    "Food",
                    "Transport",
                    "Utilities",
                    "Shopping",
                    "Education",
                    "Health",
                    "Entertainment",
                    "Other Expense",
                ][..],
            ),
        ] {
            for name in names {
                sqlx::query("INSERT INTO categories (id,name,kind,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(kind,name) DO NOTHING")
                    .bind(Uuid::new_v4().to_string()).bind(name).bind(kind).bind(&now).bind(&now).execute(&mut *tx).await?;
            }
        }
        sqlx::query("INSERT INTO settings VALUES ('seedVersion','1')")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn create_account(&self, input: AccountInput) -> Result<()> {
        let name = domain::text(&input.name, 80, true)?;
        if !["cash", "bank", "ewallet", "other"].contains(&input.account_type.as_str()) {
            return Err(AppError::validation(
                "Choose a supported cash-like account type.",
            ));
        }
        domain::date(&input.opening_balance_date)?;
        let amount = domain::parse_money(&input.opening_balance_text, true)?;
        let now = Utc::now().to_rfc3339();
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO accounts (id,name,type,opening_balance_minor,opening_balance_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(name).bind(input.account_type).bind(amount).bind(input.opening_balance_date).bind(&now).bind(&now).execute(&mut *tx).await?;
        // Validate all derived ranges before committing the new financial effect.
        Self::read_snapshot(&mut tx, "2000-01").await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn create_transaction(&self, input: TransactionInput) -> Result<()> {
        self.save_transaction(None, input).await
    }

    pub async fn save_transaction(
        &self,
        id: Option<String>,
        input: TransactionInput,
    ) -> Result<()> {
        if !["income", "expense", "transfer"].contains(&input.kind.as_str()) {
            return Err(AppError::validation("Choose income, expense, or transfer."));
        }
        let amount = domain::parse_money(&input.amount_text, false)?;
        domain::date(&input.transaction_date)?;
        domain::uuid(&input.account_id)?;
        let payee = domain::text(&input.payee, 120, false)?;
        let note = domain::text(&input.note, 1000, false)?;
        let mut tx = self.pool.begin().await?;
        if let Some(ref id) = id {
            domain::uuid(id)?;
            let exists: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM transactions WHERE id=? AND deleted_at IS NULL",
            )
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
            if exists != 1 {
                return Err(AppError::validation(
                    "This transaction no longer exists. Refresh your history.",
                ));
            }
        }
        Self::validate_account(&mut tx, &input.account_id, &input.transaction_date).await?;
        if input.kind == "transfer" {
            if input.category_id.is_some() {
                return Err(AppError::validation("Transfers do not have a category."));
            }
            let destination = input
                .transfer_account_id
                .as_deref()
                .ok_or_else(|| AppError::validation("Choose a destination account."))?;
            domain::uuid(destination)?;
            if destination == input.account_id {
                return Err(AppError::validation("Transfer accounts must be different."));
            }
            Self::validate_account(&mut tx, destination, &input.transaction_date).await?;
        } else {
            if input.transfer_account_id.is_some() {
                return Err(AppError::validation(
                    "Only transfers have a destination account.",
                ));
            }
            let category = input
                .category_id
                .as_deref()
                .ok_or_else(|| AppError::validation("Choose a category."))?;
            domain::uuid(category)?;
            let valid: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM categories WHERE id=? AND kind=? AND is_archived=0",
            )
            .bind(category)
            .bind(&input.kind)
            .fetch_one(&mut *tx)
            .await?;
            if valid != 1 {
                return Err(AppError::validation(
                    "Choose an active category matching the transaction kind.",
                ));
            }
        }
        let now = Utc::now().to_rfc3339();
        if let Some(id) = id {
            sqlx::query("UPDATE transactions SET kind=?,account_id=?,transfer_account_id=?,category_id=?,amount_minor=?,transaction_date=?,payee=?,note=?,updated_at=? WHERE id=?")
                .bind(input.kind).bind(input.account_id).bind(input.transfer_account_id).bind(input.category_id).bind(amount).bind(&input.transaction_date).bind(payee).bind(note).bind(&now).bind(id).execute(&mut *tx).await?;
        } else {
            sqlx::query("INSERT INTO transactions (id,kind,account_id,transfer_account_id,category_id,amount_minor,transaction_date,payee,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(input.kind).bind(input.account_id).bind(input.transfer_account_id).bind(input.category_id).bind(amount).bind(&input.transaction_date).bind(payee).bind(note).bind(&now).bind(&now).execute(&mut *tx).await?;
        }
        Self::read_snapshot(&mut tx, &input.transaction_date[..7]).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn validate_account(conn: &mut SqliteConnection, id: &str, date: &str) -> Result<()> {
        let account =
            sqlx::query("SELECT opening_balance_date,is_archived FROM accounts WHERE id=?")
                .bind(id)
                .fetch_optional(conn)
                .await?
                .ok_or_else(|| AppError::validation("The selected account does not exist."))?;
        if account.get::<bool, _>("is_archived") {
            return Err(AppError::validation("Choose an active account."));
        }
        if date < account.get::<String, _>("opening_balance_date").as_str() {
            return Err(AppError::validation(
                "Transaction date cannot be before either account's tracking start date.",
            ));
        }
        Ok(())
    }

    pub async fn snapshot(&self, period: &str) -> Result<Snapshot> {
        domain::period_bounds(period)?;
        let mut tx = self.pool.begin().await?;
        let result = Self::read_snapshot(&mut tx, period).await?;
        tx.commit().await?;
        Ok(result)
    }

    pub(crate) async fn read_snapshot(
        conn: &mut SqliteConnection,
        period: &str,
    ) -> Result<Snapshot> {
        let (start, end) = domain::period_bounds(period)?;
        let account_rows = sqlx::query("SELECT * FROM accounts ORDER BY created_at,id")
            .fetch_all(&mut *conn)
            .await?;
        let rows = sqlx::query(
            "SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY transaction_date DESC,created_at DESC,id DESC",
        )
        .fetch_all(&mut *conn)
        .await?;
        let categories = sqlx::query_as::<_, Category>(
            "SELECT id,name,kind,color,is_archived FROM categories ORDER BY kind,name",
        )
        .fetch_all(&mut *conn)
        .await?;
        // i128 accumulation avoids order-dependent intermediate overflow. Validate final
        // i64 balances AND every monthly summary before exposing or committing data.
        let mut balances: BTreeMap<String, i128> = account_rows
            .iter()
            .map(|r| {
                (
                    r.get("id"),
                    r.get::<i64, _>("opening_balance_minor") as i128,
                )
            })
            .collect();
        let mut flows: BTreeMap<String, (i128, i128)> = BTreeMap::new();
        let mut transactions = Vec::new();
        let mut count = 0;
        let mut spending_totals: BTreeMap<String, i128> = BTreeMap::new();
        for row in rows {
            let kind: String = row.get("kind");
            let id: String = row.get("account_id");
            let destination: Option<String> = row.get("transfer_account_id");
            let amount = row.get::<i64, _>("amount_minor") as i128;
            let date: String = row.get("transaction_date");
            domain::date(&date)?;
            let balance = balances.get_mut(&id).ok_or_else(AppError::storage)?;
            *balance += if kind == "income" { amount } else { -amount };
            if let Some(ref destination) = destination {
                *balances
                    .get_mut(destination)
                    .ok_or_else(AppError::storage)? += amount;
            }
            let flow = flows.entry(date[..7].into()).or_default();
            if kind == "income" {
                flow.0 += amount;
            } else if kind == "expense" {
                flow.1 += amount;
            }
            if date >= start && date < end {
                if kind == "expense" {
                    *spending_totals.entry(row.get("category_id")).or_default() += amount;
                }
                count += 1;
                if transactions.len() < 100 {
                    transactions.push(Transaction {
                        id: row.get("id"),
                        kind,
                        account_id: id,
                        transfer_account_id: destination,
                        category_id: row.get("category_id"),
                        amount_minor: amount.to_string(),
                        transaction_date: date,
                        payee: row.get::<Option<String>, _>("payee").unwrap_or_default(),
                        note: row.get::<Option<String>, _>("note").unwrap_or_default(),
                    });
                }
            }
        }
        for (income, expense) in flows.values() {
            domain::checked_minor(*income)?;
            domain::checked_minor(*expense)?;
            domain::checked_minor(income - expense)?;
        }
        let total = domain::checked_minor(balances.values().sum())?;
        let mut accounts = Vec::new();
        for row in account_rows {
            let id: String = row.get("id");
            let balance = domain::checked_minor(balances[&id])?;
            accounts.push(Account {
                id,
                name: row.get("name"),
                account_type: row.get("type"),
                opening_balance_minor: row.get::<i64, _>("opening_balance_minor").to_string(),
                opening_balance_date: row.get("opening_balance_date"),
                balance_minor: balance.to_string(),
                is_archived: row.get("is_archived"),
            });
        }
        let (income, expense) = flows.get(period).copied().unwrap_or_default();
        let budget_rows = sqlx::query("SELECT * FROM budgets WHERE period=? ORDER BY category_id")
            .bind(period)
            .fetch_all(&mut *conn)
            .await?;
        let mut budgets = Vec::new();
        for row in budget_rows {
            let category_id: String = row.get("category_id");
            let limit = row.get::<i64, _>("limit_minor");
            let spent = domain::checked_minor(*spending_totals.get(&category_id).unwrap_or(&0))?;
            budgets.push(Budget {
                id: row.get("id"),
                category_id,
                period: period.into(),
                limit_minor: limit.to_string(),
                spent_minor: spent.to_string(),
                remaining_minor: domain::checked_minor(limit as i128 - spent as i128)?.to_string(),
            });
        }
        let spending = spending_totals
            .into_iter()
            .map(|(category_id, amount)| Spending {
                category_id,
                amount_minor: amount.to_string(),
            })
            .collect();
        let preferences = Self::read_preferences(conn).await?;
        Ok(Snapshot {
            accounts,
            categories,
            transactions,
            period: period.into(),
            total_tracked_balance_minor: total.to_string(),
            income_minor: income.to_string(),
            expense_minor: expense.to_string(),
            net_cash_flow_minor: (income - expense).to_string(),
            transaction_count: count,
            budgets,
            spending,
            preferences,
        })
    }
}
