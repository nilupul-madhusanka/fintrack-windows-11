use fintrack_lib::{
    models::{AccountInput, TransactionInput},
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
