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
    pub color: Option<String>,
    pub is_archived: bool,
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
    pub budgets: Vec<Budget>,
    pub spending: Vec<Spending>,
    pub preferences: Preferences,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CategoryInput {
    pub name: String,
    pub kind: String,
    pub color: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub id: String,
    pub category_id: String,
    pub period: String,
    pub limit_minor: String,
    pub spent_minor: String,
    pub remaining_minor: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spending {
    pub category_id: String,
    pub amount_minor: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub theme: String,
    pub date_format: String,
    pub profile_name: String,
    pub start_page: String,
    pub compact_entry: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            date_format: "iso".into(),
            profile_name: String::new(),
            start_page: "Dashboard".into(),
            compact_entry: false,
        }
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryFilter {
    pub start: String,
    pub end: String,
    pub kind: String,
    pub account_id: String,
    pub category_id: String,
    pub search: String,
    pub offset: i64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub rows: Vec<Transaction>,
    pub total: i64,
}
