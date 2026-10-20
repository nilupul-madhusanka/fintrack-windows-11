use crate::{
    domain,
    error::{AppError, Result},
    models::HistoryFilter,
    store::Store,
};
use chrono::Utc;
use serde::Serialize;
use sqlx::{Connection, Row, SqliteConnection, sqlite::SqliteConnectOptions};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub(crate) struct Candidate {
    token: String,
    path: PathBuf,
}
impl Drop for Candidate {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub token: String,
    pub source: String,
    pub accounts: i64,
    pub transactions: i64,
    pub total_minor: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    pub path: String,
    pub last_backup: Option<String>,
}

fn invalid() -> AppError {
    AppError { code:"BACKUP_INVALID",message:"This file is corrupt, incompatible, or contains invalid records. Select a FinTrack backup from the same app version. Your current data has not been replaced.".into() }
}
fn io_error(_: std::io::Error) -> AppError {
    AppError::validation(
        "Could not access the selected file. Check its location, permissions and available disk space. Choose a new filename when saving.",
    )
}
pub fn decimal(amount: i64) -> String {
    let value = amount as i128;
    format!(
        "{}{}.{:02}",
        if value < 0 { "-" } else { "" },
        value.abs() / 100,
        value.abs() % 100
    )
}
pub fn csv_cell(value: &str) -> String {
    let first = value.trim_start_matches(' ').chars().next();
    let protected = if matches!(first, Some('=' | '+' | '-' | '@' | '\t' | '\r' | '\n')) {
        format!("'{value}")
    } else {
        value.into()
    };
    format!("\"{}\"", protected.replace('"', "\"\""))
}
async fn schema(conn: &mut SqliteConnection) -> Result<Vec<(String, String, String)>> {
    Ok(sqlx::query("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name").fetch_all(conn).await?.into_iter().map(|r|(r.get("type"),r.get("name"),r.get("sql"))).collect())
}

impl Store {
    pub async fn data_info(&self) -> Result<DataInfo> {
        let last_backup =
            sqlx::query_scalar("SELECT value_json FROM settings WHERE key='lastBackup'")
                .fetch_optional(&self.pool)
                .await?;
        Ok(DataInfo {
            path: self.path.display().to_string(),
            last_backup,
        })
    }
    async fn verify_source(&self, path: &Path) -> Result<(i64, i64, String)> {
        let mut source = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(path)
                .read_only(true)
                .foreign_keys(true),
        )
        .await
        .map_err(|_| invalid())?;
        let result=async {
            let check:String=sqlx::query_scalar("PRAGMA integrity_check").fetch_one(&mut source).await?;
            if check!="ok" {return Err(invalid());}
            if !sqlx::query("PRAGMA foreign_key_check").fetch_all(&mut source).await?.is_empty(){return Err(invalid());}
            let expected=schema(&mut *self.pool.acquire().await?).await?;
            if schema(&mut source).await?!=expected{return Err(invalid());}
            let migrations:Vec<(i64,Vec<u8>,bool)>=sqlx::query_as("SELECT version,checksum,success FROM _sqlx_migrations ORDER BY version").fetch_all(&mut source).await?;
            let expected_migrations:Vec<(i64,Vec<u8>,bool)>=sqlx::query_as("SELECT version,checksum,success FROM _sqlx_migrations ORDER BY version").fetch_all(&self.pool).await?;
            if migrations!=expected_migrations || migrations.iter().any(|m|!m.2){return Err(invalid());}
            for query in [
                "SELECT COUNT(*) FROM accounts WHERE typeof(id)<>'text' OR typeof(name)<>'text' OR typeof(opening_balance_minor)<>'integer' OR typeof(opening_balance_date)<>'text' OR typeof(is_archived)<>'integer'",
                "SELECT COUNT(*) FROM categories WHERE typeof(id)<>'text' OR typeof(name)<>'text' OR typeof(kind)<>'text' OR typeof(is_archived)<>'integer'",
                "SELECT COUNT(*) FROM transactions WHERE typeof(id)<>'text' OR typeof(account_id)<>'text' OR typeof(amount_minor)<>'integer' OR typeof(transaction_date)<>'text' OR typeof(payee) NOT IN ('text','null') OR typeof(note) NOT IN ('text','null')",
                "SELECT COUNT(*) FROM budgets WHERE typeof(id)<>'text' OR typeof(period)<>'text' OR typeof(limit_minor)<>'integer'",
                "SELECT COUNT(*) FROM settings WHERE typeof(key)<>'text' OR typeof(value_json)<>'text'",
                "SELECT COUNT(*) FROM transactions t JOIN categories c ON t.category_id=c.id WHERE t.kind<>c.kind",
                "SELECT COUNT(*) FROM budgets b JOIN categories c ON b.category_id=c.id WHERE c.kind<>'expense'",
            ] { let count:i64=sqlx::query_scalar(query).fetch_one(&mut source).await?;if count!=0{return Err(invalid());} }
            // Check domain invariants which SQLite's structural checks cannot establish.
            for row in sqlx::query("SELECT * FROM accounts").fetch_all(&mut source).await? {
                domain::uuid(&row.get::<String,_>("id"))?;domain::date(&row.get::<String,_>("opening_balance_date"))?;
                domain::text(&row.get::<String,_>("name"),80,true)?;
                if (row.get::<i64,_>("opening_balance_minor") as i128).abs()>domain::MAX_AMOUNT as i128{return Err(invalid());}
            }
            for row in sqlx::query("SELECT * FROM categories").fetch_all(&mut source).await? {domain::uuid(&row.get::<String,_>("id"))?;domain::text(&row.get::<String,_>("name"),80,true)?;}
            let invalid_dates:i64=sqlx::query_scalar("SELECT COUNT(*) FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts d ON d.id=t.transfer_account_id WHERE t.transaction_date<a.opening_balance_date OR t.transaction_date<d.opening_balance_date").fetch_one(&mut source).await?;
            if invalid_dates!=0{return Err(invalid());}
            for row in sqlx::query("SELECT id,amount_minor,transaction_date,payee,note FROM transactions").fetch_all(&mut source).await? {
                domain::uuid(&row.get::<String,_>("id"))?;domain::date(&row.get::<String,_>("transaction_date"))?;
                let amount=row.get::<i64,_>("amount_minor");if !(1..=domain::MAX_AMOUNT).contains(&amount){return Err(invalid());}
                domain::text(&row.get::<Option<String>,_>("payee").unwrap_or_default(),120,false)?;
                domain::text(&row.get::<Option<String>,_>("note").unwrap_or_default(),1000,false)?;
            }
            for row in sqlx::query("SELECT id,period,limit_minor FROM budgets").fetch_all(&mut source).await? {domain::uuid(&row.get::<String,_>("id"))?;domain::period_bounds(&row.get::<String,_>("period"))?;if !(1..=domain::MAX_AMOUNT).contains(&row.get::<i64,_>("limit_minor")){return Err(invalid());}}
            let snapshot=Self::read_snapshot(&mut source,"2000-01").await?;
            let count:i64=sqlx::query_scalar("SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL").fetch_one(&mut source).await?;
            Ok((snapshot.accounts.len() as i64,count,snapshot.total_tracked_balance_minor))
        }.await;
        source.close().await.map_err(|_| invalid())?;
        result.map_err(|_| invalid())
    }
    pub async fn create_backup(&self, destination: &Path) -> Result<()> {
        if destination.exists() {
            return Err(AppError::validation(
                "Choose a new backup filename. Existing files are never overwritten.",
            ));
        }
        let mut conn = self.pool.acquire().await?;
        sqlx::query("VACUUM INTO ?")
            .bind(destination.to_string_lossy().as_ref())
            .execute(&mut *conn)
            .await?;
        drop(conn);
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(destination)
            .map_err(io_error)?
            .sync_all()
            .map_err(io_error)?;
        self.verify_source(destination).await?;
        let metadata = format!(
            "{} · {} · unencrypted",
            Utc::now().to_rfc3339(),
            destination.display()
        );
        sqlx::query("INSERT INTO settings VALUES ('lastBackup',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").bind(metadata).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn inspect_backup(&self, source: &Path) -> Result<BackupPreview> {
        let meta = fs::metadata(source).map_err(io_error)?;
        if !meta.is_file() || meta.len() > 512 * 1024 * 1024 {
            return Err(invalid());
        }
        let wal = PathBuf::from(format!("{}-wal", source.display()));
        if fs::metadata(wal).map(|m| m.len() > 0).unwrap_or(false) {
            return Err(AppError::validation(
                "Select a completed FinTrack backup, not an open application's live database.",
            ));
        }
        let token = Uuid::new_v4().to_string();
        let candidate = Candidate {
            token: token.clone(),
            path: self.path.with_file_name(format!("restore-{token}.sqlite")),
        };
        fs::copy(source, &candidate.path).map_err(io_error)?;
        let (accounts, transactions, total_minor) = self.verify_source(&candidate.path).await?;
        *self
            .restore_candidate
            .lock()
            .map_err(|_| AppError::storage())? = Some(candidate);
        Ok(BackupPreview {
            token,
            source: source.display().to_string(),
            accounts,
            transactions,
            total_minor,
        })
    }
    pub async fn restore_backup(&self, token: String, confirmed: bool) -> Result<String> {
        if !confirmed {
            return Err(AppError::validation(
                "Confirm replacement before restoring.",
            ));
        }
        let candidate = self
            .restore_candidate
            .lock()
            .map_err(|_| AppError::storage())?
            .take()
            .ok_or_else(|| AppError::validation("Select and inspect a backup first."))?;
        if candidate.token != token {
            return Err(AppError::validation(
                "Backup selection expired. Select the file again.",
            ));
        }
        self.verify_source(&candidate.path).await?;
        let safety = self
            .path
            .with_file_name(format!("safety-{}.sqlite", Uuid::new_v4()));
        let mut conn = self.pool.acquire().await?;
        // Keep the only pool connection throughout safety-copy creation and atomic restore.
        sqlx::query("VACUUM INTO ?")
            .bind(safety.to_string_lossy().as_ref())
            .execute(&mut *conn)
            .await?;
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(&safety)
            .map_err(io_error)?
            .sync_all()
            .map_err(io_error)?;
        let mut safety_check = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&safety)
                .read_only(true),
        )
        .await?;
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&mut safety_check)
            .await?;
        safety_check.close().await?;
        if integrity != "ok" {
            return Err(AppError::validation(
                "Safety backup could not be verified. Current data was not replaced.",
            ));
        }
        sqlx::query("ATTACH DATABASE ? AS restore_source")
            .bind(candidate.path.to_string_lossy().as_ref())
            .execute(&mut *conn)
            .await?;
        let outcome = async {
            let mut tx = conn.begin().await?;
            for table in [
                "budgets",
                "transactions",
                "categories",
                "accounts",
                "settings",
            ] {
                sqlx::query(&format!("DELETE FROM main.{table}"))
                    .execute(&mut *tx)
                    .await?;
            }
            // Only trusted table names and the current schema are used. Never execute a backup's SQL.
            for table in [
                "accounts",
                "categories",
                "transactions",
                "budgets",
                "settings",
            ] {
                sqlx::query(&format!(
                    "INSERT INTO main.{table} SELECT * FROM restore_source.{table}"
                ))
                .execute(&mut *tx)
                .await?;
            }
            Self::read_snapshot(&mut tx, "2000-01").await?;
            tx.commit().await?;
            Ok::<(), AppError>(())
        }
        .await;
        let detached = sqlx::query("DETACH DATABASE restore_source")
            .execute(&mut *conn)
            .await;
        // A failed detach retires the connection rather than leaking an attached source.
        if detached.is_err() {
            conn.close().await?;
        }
        outcome?;
        Ok(safety.display().to_string())
    }
    pub async fn export_csv(&self, filter: HistoryFilter, destination: &Path) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let history = Self::history_on(&mut tx, &filter, false).await?;
        let snapshot = Self::read_snapshot(&mut tx, "2000-01").await?;
        tx.commit().await?;
        let account = |id: &str| {
            snapshot
                .accounts
                .iter()
                .find(|a| a.id == id)
                .map(|a| a.name.clone())
                .unwrap_or_default()
        };
        let mut csv = String::from(
            "\u{feff}Date,Type,Source account,Destination account,Category,Amount,Currency,Payee,Note,Filter start,Filter end,Filter kind,Filter account,Filter category,Filter search\r\n",
        );
        for row in history.rows {
            let category = snapshot
                .categories
                .iter()
                .find(|c| Some(&c.id) == row.category_id.as_ref())
                .map(|c| c.name.clone())
                .unwrap_or_default();
            let amount = decimal(row.amount_minor.parse().map_err(|_| AppError::storage())?);
            let fields = [
                row.transaction_date,
                row.kind,
                account(&row.account_id),
                row.transfer_account_id
                    .as_deref()
                    .map(account)
                    .unwrap_or_default(),
                category,
                amount,
                "LKR".into(),
                row.payee,
                row.note,
                filter.start.clone(),
                filter.end.clone(),
                filter.kind.clone(),
                account(&filter.account_id),
                snapshot
                    .categories
                    .iter()
                    .find(|c| c.id == filter.category_id)
                    .map(|c| c.name.clone())
                    .unwrap_or_default(),
                filter.search.clone(),
            ];
            csv.push_str(
                &fields
                    .iter()
                    .map(|s| csv_cell(s))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            csv.push_str("\r\n");
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(io_error)?;
        file.write_all(csv.as_bytes()).map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
        Ok(())
    }
}
