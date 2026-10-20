use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccountInput {
    pub name: String,
    pub account_type: String,
    pub opening_balance_text: String,
    pub opening_balance_date: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransactionInput {
    pub kind: String,
    pub account_id: String,
    pub transfer_account_id: Option<String>,
    pub category_id: Option<String>,
    pub amount_text: String,
    pub transaction_date: String,
    pub payee: String,
    pub note: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub account_type: String,
    pub opening_balance_minor: String,
    pub opening_balance_date: String,
    pub balance_minor: String,
    pub is_archived: bool,
}
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub kind: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub kind: String,
    pub account_id: String,
    pub transfer_account_id: Option<String>,
    pub category_id: Option<String>,
    pub amount_minor: String,
    pub transaction_date: String,
    pub payee: String,
    pub note: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub accounts: Vec<Account>,
    pub categories: Vec<Category>,
    pub transactions: Vec<Transaction>,
    pub period: String,
    pub total_tracked_balance_minor: String,
    pub income_minor: String,
    pub expense_minor: String,
    pub net_cash_flow_minor: String,
    pub transaction_count: usize,
}
