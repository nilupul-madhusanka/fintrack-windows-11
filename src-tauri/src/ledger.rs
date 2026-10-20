use crate::{
    domain,
    error::{AppError, Result},
    models::*,
    store::Store,
};
use chrono::Utc;
use sqlx::{Row, SqliteConnection};
use uuid::Uuid;

impl Store {
    pub async fn update_account(
        &self,
        id: String,
        input: AccountInput,
        confirm_balance: bool,
    ) -> Result<()> {
        domain::uuid(&id)?;
        let name = domain::text(&input.name, 80, true)?;
        if !["cash", "bank", "ewallet", "other"].contains(&input.account_type.as_str()) {
            return Err(AppError::validation("Choose a supported account type."));
        }
        domain::date(&input.opening_balance_date)?;
        let balance = domain::parse_money(&input.opening_balance_text, true)?;
        let mut tx = self.pool.begin().await?;
        let old = sqlx::query(
            "SELECT opening_balance_minor,opening_balance_date FROM accounts WHERE id=?",
        )
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::validation("Account not found."))?;
        if (old.get::<i64, _>("opening_balance_minor") != balance
            || old.get::<String, _>("opening_balance_date") != input.opening_balance_date)
            && !confirm_balance
        {
            return Err(AppError::validation(
                "Confirm the opening balance change; this changes historical balances.",
            ));
        }
        let earlier: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM transactions WHERE (account_id=? OR transfer_account_id=?) AND transaction_date<?").bind(&id).bind(&id).bind(&input.opening_balance_date).fetch_one(&mut *tx).await?;
        if earlier > 0 {
            return Err(AppError::validation(
                "Tracking cannot start after an existing transaction, including deleted records.",
            ));
        }
        sqlx::query("UPDATE accounts SET name=?,type=?,opening_balance_minor=?,opening_balance_date=?,updated_at=? WHERE id=?").bind(name).bind(input.account_type).bind(balance).bind(input.opening_balance_date).bind(Utc::now().to_rfc3339()).bind(id).execute(&mut *tx).await?;
        Self::read_snapshot(&mut tx, "2000-01").await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn archive(&self, entity: &str, id: String, archived: bool) -> Result<()> {
        domain::uuid(&id)?;
        let sql = match entity {
            "account" => "UPDATE accounts SET is_archived=?,updated_at=? WHERE id=?",
            "category" => "UPDATE categories SET is_archived=?,updated_at=? WHERE id=?",
            _ => return Err(AppError::validation("Unknown record type.")),
        };
        let mut tx = self.pool.begin().await?;
        if sqlx::query(sql)
            .bind(archived)
            .bind(Utc::now().to_rfc3339())
            .bind(id)
            .execute(&mut *tx)
            .await?
            .rows_affected()
            != 1
        {
            return Err(AppError::validation("Record not found."));
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn save_category(&self, id: Option<String>, input: CategoryInput) -> Result<()> {
        let name = domain::text(&input.name, 80, true)?;
        if !["income", "expense"].contains(&input.kind.as_str()) {
            return Err(AppError::validation(
                "Choose an income or expense category.",
            ));
        }
        if input.color.len() != 7
            || !input.color.starts_with('#')
            || !input.color[1..].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(AppError::validation("Choose a valid category color."));
        }
        let mut tx = self.pool.begin().await?;
        let duplicate: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM categories WHERE kind=? AND lower(name)=lower(?) AND id<>?",
        )
        .bind(&input.kind)
        .bind(&name)
        .bind(id.as_deref().unwrap_or(""))
        .fetch_one(&mut *tx)
        .await?;
        if duplicate > 0 {
            return Err(AppError::validation(
                "A category with that name already exists for this kind.",
            ));
        }
        let now = Utc::now().to_rfc3339();
        if let Some(id) = id {
            domain::uuid(&id)?;
            let kind: Option<String> = sqlx::query_scalar("SELECT kind FROM categories WHERE id=?")
                .bind(&id)
                .fetch_optional(&mut *tx)
                .await?;
            if kind.as_deref() != Some(&input.kind) {
                return Err(AppError::validation(
                    "Category kind cannot change. Create another category instead.",
                ));
            }
            sqlx::query("UPDATE categories SET name=?,color=?,updated_at=? WHERE id=?")
                .bind(name)
                .bind(input.color)
                .bind(now)
                .bind(id)
                .execute(&mut *tx)
                .await?;
        } else {
            sqlx::query("INSERT INTO categories (id,name,kind,color,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(name).bind(input.kind).bind(input.color).bind(&now).bind(&now).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn delete_transaction(&self, id: String, undo: bool) -> Result<()> {
        domain::uuid(&id)?;
        let mut tx = self.pool.begin().await?;
        let statement = if undo {
            "UPDATE transactions SET deleted_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NOT NULL"
        } else {
            "UPDATE transactions SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL"
        };
        let now = Utc::now().to_rfc3339();
        let mut query = sqlx::query(statement);
        if !undo {
            query = query.bind(&now);
        }
        if query
            .bind(&now)
            .bind(id)
            .execute(&mut *tx)
            .await?
            .rows_affected()
            != 1
        {
            return Err(AppError::validation(
                "This transaction has already changed. Refresh your history.",
            ));
        }
        Self::read_snapshot(&mut tx, "2000-01").await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn upsert_budget(
        &self,
        category_id: String,
        period: String,
        amount_text: String,
    ) -> Result<()> {
        domain::uuid(&category_id)?;
        domain::period_bounds(&period)?;
        let limit = domain::parse_money(&amount_text, false)?;
        let mut tx = self.pool.begin().await?;
        let valid: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM categories WHERE id=? AND kind='expense' AND is_archived=0",
        )
        .bind(&category_id)
        .fetch_one(&mut *tx)
        .await?;
        if valid != 1 {
            return Err(AppError::validation("Choose an active expense category."));
        }
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO budgets (id,category_id,period,limit_minor,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(category_id,period) DO UPDATE SET limit_minor=excluded.limit_minor,updated_at=excluded.updated_at").bind(Uuid::new_v4().to_string()).bind(category_id).bind(period).bind(limit).bind(&now).bind(&now).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn delete_budget(&self, id: String) -> Result<()> {
        domain::uuid(&id)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM budgets WHERE id=?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
    pub(crate) async fn read_preferences(conn: &mut SqliteConnection) -> Result<Preferences> {
        let value: Option<String> =
            sqlx::query_scalar("SELECT value_json FROM settings WHERE key='preferences'")
                .fetch_optional(conn)
                .await?;
        let preferences = match value {
            Some(value) => serde_json::from_str(&value).map_err(|_| {
                AppError::validation("Preferences are incompatible with this version.")
            })?,
            None => Preferences::default(),
        };
        Self::validate_preferences(&preferences)?;
        Ok(preferences)
    }
    pub(crate) fn validate_preferences(input: &Preferences) -> Result<()> {
        domain::text(&input.profile_name, 80, false)?;
        if !["light", "dark", "system"].contains(&input.theme.as_str())
            || !["iso", "day-first", "month-first"].contains(&input.date_format.as_str())
            || ![
                "Dashboard",
                "Transactions",
                "Accounts",
                "Budgets",
                "Reports",
                "Settings",
            ]
            .contains(&input.start_page.as_str())
        {
            return Err(AppError::validation(
                "Choose supported appearance and date preferences.",
            ));
        }
        Ok(())
    }
    pub async fn save_preferences(&self, input: Preferences) -> Result<()> {
        Self::validate_preferences(&input)?;
        let json = serde_json::to_string(&input).map_err(|_| AppError::storage())?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("INSERT INTO settings VALUES ('preferences',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").bind(json).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn history(&self, filter: HistoryFilter) -> Result<HistoryPage> {
        let mut tx = self.pool.begin().await?;
        let page = Self::history_on(&mut tx, &filter, true).await?;
        tx.commit().await?;
        Ok(page)
    }
    pub(crate) async fn history_on(
        conn: &mut SqliteConnection,
        filter: &HistoryFilter,
        paginate: bool,
    ) -> Result<HistoryPage> {
        domain::date(&filter.start)?;
        let end = domain::date(&filter.end)?
            .succ_opt()
            .ok_or_else(|| AppError::validation("Date range is too large."))?
            .to_string();
        if filter.start > filter.end || filter.offset < 0 || filter.offset > 2_000_000 {
            return Err(AppError::validation("Choose a valid date range and page."));
        }
        if !["", "income", "expense", "transfer"].contains(&filter.kind.as_str()) {
            return Err(AppError::validation("Choose a valid transaction kind."));
        }
        if !filter.account_id.is_empty() {
            domain::uuid(&filter.account_id)?;
        }
        if !filter.category_id.is_empty() {
            domain::uuid(&filter.category_id)?;
        }
        let search = domain::text(&filter.search, 200, false)?;
        let condition = " FROM transactions WHERE deleted_at IS NULL AND transaction_date>=? AND transaction_date<? AND (?='' OR kind=?) AND (?='' OR account_id=? OR transfer_account_id=?) AND (?='' OR category_id=?) AND (?='' OR instr(lower(coalesce(payee,'') || ' ' || coalesce(note,'')),lower(?))>0)";
        let count_sql = format!("SELECT COUNT(*) AS total{condition}");
        let total = sqlx::query(&count_sql)
            .bind(&filter.start)
            .bind(&end)
            .bind(&filter.kind)
            .bind(&filter.kind)
            .bind(&filter.account_id)
            .bind(&filter.account_id)
            .bind(&filter.account_id)
            .bind(&filter.category_id)
            .bind(&filter.category_id)
            .bind(&search)
            .bind(&search)
            .fetch_one(&mut *conn)
            .await?
            .get::<i64, _>("total");
        let list_sql = format!(
            "SELECT *{condition} ORDER BY transaction_date DESC,created_at DESC,id DESC LIMIT ? OFFSET ?"
        );
        let rows = sqlx::query(&list_sql)
            .bind(&filter.start)
            .bind(end)
            .bind(&filter.kind)
            .bind(&filter.kind)
            .bind(&filter.account_id)
            .bind(&filter.account_id)
            .bind(&filter.account_id)
            .bind(&filter.category_id)
            .bind(&filter.category_id)
            .bind(&search)
            .bind(search.clone())
            .bind(if paginate { 100_i64 } else { -1_i64 })
            .bind(if paginate { filter.offset } else { 0 })
            .fetch_all(conn)
            .await?;
        let rows = rows
            .into_iter()
            .map(|r| Transaction {
                id: r.get("id"),
                kind: r.get("kind"),
                account_id: r.get("account_id"),
                transfer_account_id: r.get("transfer_account_id"),
                category_id: r.get("category_id"),
                amount_minor: r.get::<i64, _>("amount_minor").to_string(),
                transaction_date: r.get("transaction_date"),
                payee: r.get::<Option<String>, _>("payee").unwrap_or_default(),
                note: r.get::<Option<String>, _>("note").unwrap_or_default(),
            })
            .collect();
        Ok(HistoryPage { rows, total })
    }
}
