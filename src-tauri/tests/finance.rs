use fintrack_lib::{
    models::{AccountInput, CategoryInput, HistoryFilter, Preferences, TransactionInput},
    store::Store,
};
use tempfile::TempDir;

async fn fixture() -> (TempDir, Store) {
    let directory = tempfile::tempdir().unwrap();
    let store = Store::open(&directory.path().join("test.sqlite"))
        .await
        .unwrap();
    (directory, store)
}
async fn account(store: &Store, name: &str, opening: &str) -> String {
    store
        .create_account(AccountInput {
            name: name.into(),
            account_type: "cash".into(),
            opening_balance_text: opening.into(),
            opening_balance_date: "2026-10-01".into(),
        })
        .await
        .unwrap();
    store
        .snapshot("2026-10")
        .await
        .unwrap()
        .accounts
        .into_iter()
        .find(|a| a.name == name)
        .unwrap()
        .id
}
async fn entry(
    store: &Store,
    kind: &str,
    source: &str,
    destination: Option<&str>,
    amount: &str,
) -> TransactionInput {
    let category_id = if kind == "transfer" {
        None
    } else {
        Some(
            store
                .snapshot("2026-10")
                .await
                .unwrap()
                .categories
                .into_iter()
                .find(|c| c.kind == kind)
                .unwrap()
                .id,
        )
    };
    TransactionInput {
        kind: kind.into(),
        account_id: source.into(),
        transfer_account_id: destination.map(String::from),
        category_id,
        amount_text: amount.into(),
        transaction_date: "2026-10-20".into(),
        payee: "Fictional test entry".into(),
        note: "".into(),
    }
}

#[tokio::test]
async fn plan_reconciliation_and_reopen_persistence() {
    let (directory, store) = fixture().await;
    assert!(store.snapshot("2026-10").await.unwrap().accounts.is_empty());
    let cash = account(&store, "Cash", "10000").await;
    let bank = account(&store, "Bank", "40000").await;
    store
        .create_transaction(entry(&store, "income", &bank, None, "20000").await)
        .await
        .unwrap();
    store
        .create_transaction(entry(&store, "expense", &cash, None, "3500").await)
        .await
        .unwrap();
    store
        .create_transaction(entry(&store, "transfer", &bank, Some(&cash), "2000").await)
        .await
        .unwrap();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(
        snapshot
            .accounts
            .iter()
            .find(|a| a.id == cash)
            .unwrap()
            .balance_minor,
        "850000"
    );
    assert_eq!(
        snapshot
            .accounts
            .iter()
            .find(|a| a.id == bank)
            .unwrap()
            .balance_minor,
        "5800000"
    );
    assert_eq!(snapshot.total_tracked_balance_minor, "6650000");
    assert_eq!(snapshot.income_minor, "2000000");
    assert_eq!(snapshot.expense_minor, "350000");
    assert_eq!(snapshot.net_cash_flow_minor, "1650000");
    let category_ids: Vec<_> = snapshot.categories.iter().map(|c| c.id.clone()).collect();
    store.pool.close().await;
    let reopened = Store::open(&directory.path().join("test.sqlite"))
        .await
        .unwrap();
    let snapshot = reopened.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.total_tracked_balance_minor, "6650000");
    assert_eq!(snapshot.transaction_count, 3);
    assert_eq!(snapshot.categories.len(), 12);
    assert_eq!(
        snapshot
            .categories
            .iter()
            .map(|c| c.id.clone())
            .collect::<Vec<_>>(),
        category_ids
    );
    let empty_month = reopened.snapshot("2026-11").await.unwrap();
    assert_eq!(empty_month.income_minor, "0");
    assert_eq!(empty_month.expense_minor, "0");
    assert_eq!(empty_month.total_tracked_balance_minor, "6650000");
    reopened.pool.close().await;
}

#[tokio::test]
async fn invalid_transactions_have_no_financial_effect() {
    let (_directory, store) = fixture().await;
    let cash = account(&store, "Cash", "1000").await;
    let bank = account(&store, "Bank", "0").await;
    let mut invalid = Vec::new();
    invalid.push(entry(&store, "transfer", &cash, Some(&cash), "10").await);
    invalid.push(entry(&store, "expense", &cash, None, "0").await);
    invalid.push(entry(&store, "expense", &cash, None, "1.234").await);
    let mut bad_date = entry(&store, "expense", &cash, None, "10").await;
    bad_date.transaction_date = "2026-02-31".into();
    invalid.push(bad_date);
    let mut too_early = entry(&store, "transfer", &cash, Some(&bank), "10").await;
    too_early.transaction_date = "2026-09-30".into();
    invalid.push(too_early);
    let mut wrong_kind = entry(&store, "income", &cash, None, "10").await;
    wrong_kind.kind = "expense".into();
    invalid.push(wrong_kind);
    let mut wrong_shape = entry(&store, "expense", &cash, None, "10").await;
    wrong_shape.transfer_account_id = Some(bank);
    invalid.push(wrong_shape);
    for input in invalid {
        assert!(store.create_transaction(input).await.is_err());
    }
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.transaction_count, 0);
    assert_eq!(snapshot.total_tracked_balance_minor, "100000");
    store.pool.close().await;
}

#[tokio::test]
async fn archived_accounts_and_destination_start_dates_are_validated() {
    let (_directory, store) = fixture().await;
    let cash = account(&store, "Cash", "100").await;
    let bank = account(&store, "Bank", "200").await;
    sqlx::query("UPDATE accounts SET opening_balance_date='2026-10-25' WHERE id=?")
        .bind(&bank)
        .execute(&store.pool)
        .await
        .unwrap();
    assert!(
        store
            .create_transaction(entry(&store, "transfer", &cash, Some(&bank), "10").await)
            .await
            .is_err()
    );
    sqlx::query("UPDATE accounts SET is_archived=1 WHERE id=?")
        .bind(&cash)
        .execute(&store.pool)
        .await
        .unwrap();
    assert!(
        store
            .create_transaction(entry(&store, "expense", &cash, None, "10").await)
            .await
            .is_err()
    );
    // Historical total must not silently discard archived balances.
    assert_eq!(
        store
            .snapshot("2026-10")
            .await
            .unwrap()
            .total_tracked_balance_minor,
        "30000"
    );
    store.pool.close().await;
}

#[tokio::test]
async fn month_boundaries_and_negative_balances() {
    let (_directory, store) = fixture().await;
    let cash = account(&store, "Cash", "0").await;
    for (date, amount) in [("2026-10-31", "10"), ("2026-11-01", "20")] {
        let mut input = entry(&store, "expense", &cash, None, amount).await;
        input.transaction_date = date.into();
        store.create_transaction(input).await.unwrap();
    }
    let october = store.snapshot("2026-10").await.unwrap();
    assert_eq!(october.expense_minor, "1000");
    assert_eq!(october.accounts[0].balance_minor, "-3000");
    assert_eq!(
        store.snapshot("2026-11").await.unwrap().expense_minor,
        "2000"
    );
    store.pool.close().await;
}

#[tokio::test]
async fn database_constraints_and_foreign_keys_are_active() {
    let (_directory, store) = fixture().await;
    let enabled: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
        .fetch_one(&store.pool)
        .await
        .unwrap();
    assert_eq!(enabled, 1);
    let cash = account(&store, "Cash", "0").await;
    let snapshot = store.snapshot("2026-10").await.unwrap();
    let income_category = &snapshot
        .categories
        .iter()
        .find(|c| c.kind == "income")
        .unwrap()
        .id;
    let result = sqlx::query("INSERT INTO transactions (id,kind,account_id,category_id,amount_minor,transaction_date,created_at,updated_at) VALUES ('test','expense',?,?,100,'2026-10-20','','')")
        .bind(&cash).bind(income_category).execute(&store.pool).await;
    assert!(result.is_err());
    assert!(
        sqlx::query("DELETE FROM categories WHERE id='missing'")
            .execute(&store.pool)
            .await
            .is_ok()
    );
    store
        .create_transaction(entry(&store, "income", &cash, None, "1").await)
        .await
        .unwrap();
    assert!(
        sqlx::query("DELETE FROM accounts WHERE id=?")
            .bind(cash)
            .execute(&store.pool)
            .await
            .is_err()
    );
    store.pool.close().await;
}

#[tokio::test]
async fn overflow_rolls_back_the_whole_write() {
    let (_directory, store) = fixture().await;
    let cash = account(&store, "Cash", "0").await;
    // Synthetic boundary fixture, never a real user's database.
    sqlx::query("UPDATE accounts SET opening_balance_minor=? WHERE id=?")
        .bind(i64::MAX)
        .bind(&cash)
        .execute(&store.pool)
        .await
        .unwrap();
    let error = store
        .create_transaction(entry(&store, "income", &cash, None, "0.01").await)
        .await
        .unwrap_err();
    assert_eq!(error.code, "VALIDATION_ERROR");
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.accounts[0].balance_minor, i64::MAX.to_string());
    assert_eq!(snapshot.transaction_count, 0);
    store.pool.close().await;
}

#[tokio::test]
async fn ipc_contract_preserves_money_as_strings() {
    let (_directory, store) = fixture().await;
    let input: AccountInput = serde_json::from_value(serde_json::json!({"name":"Cash","accountType":"cash","openingBalanceText":"1250.50","openingBalanceDate":"2026-10-01"})).unwrap();
    store.create_account(input).await.unwrap();
    let snapshot = serde_json::to_value(store.snapshot("2026-10").await.unwrap()).unwrap();
    assert_eq!(snapshot["accounts"][0]["balanceMinor"], "125050");
    assert_eq!(snapshot["totalTrackedBalanceMinor"], "125050");
    assert_eq!(snapshot["incomeMinor"], "0");
    store.pool.close().await;
}

#[tokio::test]
async fn corrections_deletion_and_undo_reconcile_both_transfer_accounts() {
    let (_dir, store) = fixture().await;
    let cash = account(&store, "Cash", "100").await;
    let bank = account(&store, "Bank", "200").await;
    store
        .create_transaction(entry(&store, "transfer", &bank, Some(&cash), "20").await)
        .await
        .unwrap();
    let id = store.snapshot("2026-10").await.unwrap().transactions[0]
        .id
        .clone();
    store
        .save_transaction(
            Some(id.clone()),
            entry(&store, "transfer", &cash, Some(&bank), "10").await,
        )
        .await
        .unwrap();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(
        snapshot
            .accounts
            .iter()
            .find(|a| a.id == cash)
            .unwrap()
            .balance_minor,
        "9000"
    );
    assert_eq!(snapshot.total_tracked_balance_minor, "30000");
    assert_eq!(snapshot.income_minor, "0");
    store.delete_transaction(id.clone(), false).await.unwrap();
    assert_eq!(
        store
            .snapshot("2026-10")
            .await
            .unwrap()
            .accounts
            .iter()
            .find(|a| a.id == cash)
            .unwrap()
            .balance_minor,
        "10000"
    );
    store.delete_transaction(id, true).await.unwrap();
    assert_eq!(
        store
            .snapshot("2026-10")
            .await
            .unwrap()
            .accounts
            .iter()
            .find(|a| a.id == cash)
            .unwrap()
            .balance_minor,
        "9000"
    );
    store.pool.close().await;
}
#[tokio::test]
async fn budget_upsert_overspending_and_category_rules() {
    let (_dir, store) = fixture().await;
    let cash = account(&store, "Cash", "1000").await;
    let input = entry(&store, "expense", &cash, None, "150").await;
    let category = input.category_id.clone().unwrap();
    store
        .upsert_budget(category.clone(), "2026-10".into(), "100".into())
        .await
        .unwrap();
    store.create_transaction(input).await.unwrap();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.budgets[0].remaining_minor, "-5000");
    assert_eq!(snapshot.spending[0].amount_minor, "15000");
    store
        .upsert_budget(category, "2026-10".into(), "200".into())
        .await
        .unwrap();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.budgets.len(), 1);
    assert_eq!(snapshot.budgets[0].remaining_minor, "5000");
    let income = snapshot
        .categories
        .iter()
        .find(|c| c.kind == "income")
        .unwrap();
    assert!(
        store
            .upsert_budget(income.id.clone(), "2026-10".into(), "10".into())
            .await
            .is_err()
    );
    store.pool.close().await;
}
#[tokio::test]
async fn account_edits_require_confirmation_and_preserve_start_date_rules() {
    let (_dir, store) = fixture().await;
    let cash = account(&store, "Cash", "100").await;
    store
        .create_transaction(entry(&store, "expense", &cash, None, "5").await)
        .await
        .unwrap();
    let input = || AccountInput {
        name: "Wallet".into(),
        account_type: "cash".into(),
        opening_balance_text: "200".into(),
        opening_balance_date: "2026-10-01".into(),
    };
    assert!(
        store
            .update_account(cash.clone(), input(), false)
            .await
            .is_err()
    );
    store
        .update_account(cash.clone(), input(), true)
        .await
        .unwrap();
    assert_eq!(
        store.snapshot("2026-10").await.unwrap().accounts[0].balance_minor,
        "19500"
    );
    let mut later = input();
    later.opening_balance_date = "2026-10-21".into();
    assert!(store.update_account(cash, later, true).await.is_err());
    store.pool.close().await;
}
#[tokio::test]
async fn renamed_seed_categories_do_not_reappear_on_restart() {
    let (dir, store) = fixture().await;
    let category = store
        .snapshot("2026-10")
        .await
        .unwrap()
        .categories
        .into_iter()
        .find(|c| c.name == "Food")
        .unwrap();
    store
        .save_category(
            Some(category.id.clone()),
            CategoryInput {
                name: "Meals".into(),
                kind: "expense".into(),
                color: "#123456".into(),
            },
        )
        .await
        .unwrap();
    store.archive("category", category.id, true).await.unwrap();
    store.pool.close().await;
    let reopened = Store::open(&dir.path().join("test.sqlite")).await.unwrap();
    let categories = reopened.snapshot("2026-10").await.unwrap().categories;
    assert_eq!(categories.len(), 12);
    assert!(!categories.iter().any(|c| c.name == "Food"));
    assert!(
        categories
            .iter()
            .any(|c| c.name == "Meals" && c.is_archived)
    );
    reopened.pool.close().await;
}
fn filter() -> HistoryFilter {
    HistoryFilter {
        start: "2026-10-01".into(),
        end: "2026-10-31".into(),
        ..Default::default()
    }
}
#[tokio::test]
async fn filtered_export_quotes_text_and_rejects_overwrite() {
    let (dir, store) = fixture().await;
    let cash = account(&store, "Cash", "100").await;
    let bank = account(&store, "Bank", "0").await;
    let mut input = entry(&store, "expense", &cash, None, "1.25").await;
    input.payee = "=1+1".into();
    input.note = "A comma, a quote\" and a newline\n100% literal".into();
    store.create_transaction(input).await.unwrap();
    store
        .create_transaction(entry(&store, "transfer", &cash, Some(&bank), "2").await)
        .await
        .unwrap();
    let mut selected = filter();
    selected.search = "100%".into();
    assert_eq!(store.history(selected.clone()).await.unwrap().total, 1);
    let path = dir.path().join("export.csv");
    store.export_csv(selected, &path).await.unwrap();
    let contents = std::fs::read_to_string(&path).unwrap();
    assert!(contents.contains("\"'=1+1\""));
    assert!(contents.contains("a quote\"\""));
    assert!(contents.contains("\"1.25\""));
    assert!(store.export_csv(filter(), &path).await.is_err());
    let mut selected = filter();
    selected.account_id = bank;
    assert_eq!(store.history(selected).await.unwrap().total, 1);
    store.pool.close().await;
}
#[tokio::test]
async fn verified_backup_restores_into_fresh_install_and_safety_copy_is_recoverable() {
    let (dir, store) = fixture().await;
    let cash = account(&store, "Cash", "1000").await;
    let expense = entry(&store, "expense", &cash, None, "100").await;
    let category = expense.category_id.clone().unwrap();
    store.create_transaction(expense).await.unwrap();
    store
        .upsert_budget(category, "2026-10".into(), "200".into())
        .await
        .unwrap();
    let preferences = Preferences {
        profile_name: "Fictional profile".into(),
        theme: "dark".into(),
        ..Default::default()
    };
    store.save_preferences(preferences).await.unwrap();
    let path = dir.path().join("known backup.sqlite");
    store.create_backup(&path).await.unwrap();
    assert!(store.create_backup(&path).await.is_err());
    let fresh = Store::open(&dir.path().join("fresh.sqlite")).await.unwrap();
    account(&fresh, "Before restore", "50").await;
    let preview = fresh.inspect_backup(&path).await.unwrap();
    assert_eq!(preview.accounts, 1);
    assert_eq!(preview.transactions, 1);
    assert_eq!(preview.total_minor, "90000");
    assert!(
        fresh
            .restore_backup(preview.token.clone(), false)
            .await
            .is_err()
    );
    // The staged snapshot is stable even if the original selected file changes.
    std::fs::write(&path, b"changed after inspection").unwrap();
    let safety = fresh.restore_backup(preview.token, true).await.unwrap();
    let snapshot = fresh.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.total_tracked_balance_minor, "90000");
    assert_eq!(snapshot.budgets.len(), 1);
    assert_eq!(snapshot.preferences.profile_name, "Fictional profile");
    let previous = fresh
        .inspect_backup(std::path::Path::new(&safety))
        .await
        .unwrap();
    assert_eq!(previous.total_minor, "5000");
    fresh.restore_backup(previous.token, true).await.unwrap();
    assert_eq!(
        fresh
            .snapshot("2026-10")
            .await
            .unwrap()
            .total_tracked_balance_minor,
        "5000"
    );
    fresh.pool.close().await;
    store.pool.close().await;
}
#[tokio::test]
async fn corrupt_and_incompatible_backups_never_change_current_data() {
    let (dir, store) = fixture().await;
    account(&store, "Cash", "100").await;
    let bad = dir.path().join("corrupt.sqlite");
    std::fs::write(&bad, b"not a SQLite database").unwrap();
    assert!(store.inspect_backup(&bad).await.is_err());
    let incompatible = dir.path().join("incompatible.sqlite");
    store.create_backup(&incompatible).await.unwrap();
    let other = sqlx::SqlitePool::connect(&format!("sqlite:{}", incompatible.display()))
        .await
        .unwrap();
    sqlx::query("CREATE TABLE surprise (id INTEGER)")
        .execute(&other)
        .await
        .unwrap();
    other.close().await;
    assert!(store.inspect_backup(&incompatible).await.is_err());
    assert_eq!(
        store
            .snapshot("2026-10")
            .await
            .unwrap()
            .total_tracked_balance_minor,
        "10000"
    );
    store.pool.close().await;
}
#[tokio::test]
async fn ten_thousand_records_paginate_and_summarize() {
    let (_dir, store) = fixture().await;
    let cash = account(&store, "Cash", "1000").await;
    let category = entry(&store, "expense", &cash, None, "1")
        .await
        .category_id
        .unwrap();
    sqlx::query("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO transactions (id,kind,account_id,category_id,amount_minor,transaction_date,payee,note,created_at,updated_at) SELECT lower(hex(randomblob(16))),'expense',?,?,1,'2026-10-20','Fictional scale fixture','','','' FROM n").bind(&cash).bind(&category).execute(&store.pool).await.unwrap();
    let started = std::time::Instant::now();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    eprintln!("10,000-record snapshot: {:?}", started.elapsed());
    assert_eq!(snapshot.transaction_count, 10000);
    assert_eq!(snapshot.expense_minor, "10000");
    assert_eq!(snapshot.total_tracked_balance_minor, "90000");
    let first = store.history(filter()).await.unwrap();
    assert_eq!(first.rows.len(), 100);
    assert_eq!(first.total, 10000);
    let mut second_filter = filter();
    second_filter.offset = 100;
    let second = store.history(second_filter).await.unwrap();
    assert_ne!(first.rows[0].id, second.rows[0].id);
    store.pool.close().await;
}
#[tokio::test]
async fn previous_foundation_database_upgrades_without_losing_records() {
    let dir = tempfile::tempdir().unwrap();
    let migrations = dir.path().join("old-migrations");
    std::fs::create_dir(&migrations).unwrap();
    std::fs::write(
        migrations.join("0001_initial.sql"),
        include_str!("../migrations/0001_initial.sql"),
    )
    .unwrap();
    let path = dir.path().join("upgrade.sqlite");
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(migrations.as_path())
        .await
        .unwrap()
        .run(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO accounts (id,name,type,opening_balance_minor,opening_balance_date,created_at,updated_at) VALUES (?,'Existing Cash','cash',12345,'2026-10-01','','')").bind(uuid::Uuid::new_v4().to_string()).execute(&pool).await.unwrap();
    pool.close().await;
    let store = Store::open(&path).await.unwrap();
    let snapshot = store.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.accounts[0].name, "Existing Cash");
    assert_eq!(snapshot.total_tracked_balance_minor, "12345");
    store.pool.close().await;
}

#[tokio::test]
async fn invalid_typed_backup_amount_is_rejected_without_panicking() {
    let (dir, store) = fixture().await;
    let cash = account(&store, "Cash", "100").await;
    store
        .create_transaction(entry(&store, "expense", &cash, None, "1").await)
        .await
        .unwrap();
    let path = dir.path().join("bad-type.sqlite");
    store.create_backup(&path).await.unwrap();
    let other = sqlx::SqlitePool::connect(&format!("sqlite:{}", path.display()))
        .await
        .unwrap();
    sqlx::query("UPDATE transactions SET amount_minor='not-money'")
        .execute(&other)
        .await
        .unwrap();
    other.close().await;
    assert_eq!(
        store.inspect_backup(&path).await.unwrap_err().code,
        "BACKUP_INVALID"
    );
    assert_eq!(
        store
            .snapshot("2026-10")
            .await
            .unwrap()
            .total_tracked_balance_minor,
        "9900"
    );
    store.pool.close().await;
}
#[tokio::test]
async fn interrupted_restore_rolls_back_when_database_page_limit_is_reached() {
    let (dir, source) = fixture().await;
    let cash = account(&source, "Backup Cash", "1000").await;
    let category = entry(&source, "expense", &cash, None, "1")
        .await
        .category_id
        .unwrap();
    sqlx::query("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO transactions (id,kind,account_id,category_id,amount_minor,transaction_date,created_at,updated_at) SELECT lower(hex(randomblob(16))),'expense',?,?,1,'2026-10-20','','' FROM n").bind(cash).bind(category).execute(&source.pool).await.unwrap();
    let path = dir.path().join("larger-backup.sqlite");
    source.create_backup(&path).await.unwrap();
    let target = Store::open(&dir.path().join("target.sqlite"))
        .await
        .unwrap();
    account(&target, "Keep this Cash", "75").await;
    let preview = target.inspect_backup(&path).await.unwrap();
    let pages: i64 = sqlx::query_scalar("PRAGMA page_count")
        .fetch_one(&target.pool)
        .await
        .unwrap();
    sqlx::query(&format!("PRAGMA max_page_count={pages}"))
        .execute(&target.pool)
        .await
        .unwrap();
    assert!(target.restore_backup(preview.token, true).await.is_err());
    let snapshot = target.snapshot("2026-10").await.unwrap();
    assert_eq!(snapshot.total_tracked_balance_minor, "7500");
    assert_eq!(snapshot.accounts[0].name, "Keep this Cash");
    assert_eq!(snapshot.transaction_count, 0);
    target.pool.close().await;
    source.pool.close().await;
}
