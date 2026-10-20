use crate::{
    error::{AppError, Result},
    models::*,
    recovery::{BackupPreview, DataInfo},
    store::Store,
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn update_account(
    store: State<'_, Store>,
    id: String,
    input: AccountInput,
    confirm_balance: bool,
) -> Result<()> {
    store.update_account(id, input, confirm_balance).await
}
#[tauri::command]
pub async fn archive_record(
    store: State<'_, Store>,
    entity: String,
    id: String,
    archived: bool,
) -> Result<()> {
    store.archive(&entity, id, archived).await
}
#[tauri::command]
pub async fn save_category(
    store: State<'_, Store>,
    id: Option<String>,
    input: CategoryInput,
) -> Result<()> {
    store.save_category(id, input).await
}
#[tauri::command]
pub async fn update_transaction(
    store: State<'_, Store>,
    id: String,
    input: TransactionInput,
) -> Result<()> {
    store.save_transaction(Some(id), input).await
}
#[tauri::command]
pub async fn delete_transaction(
    store: State<'_, Store>,
    id: String,
    confirmed: bool,
) -> Result<()> {
    if !confirmed {
        return Err(AppError::validation("Confirm deletion first."));
    }
    store.delete_transaction(id, false).await
}
#[tauri::command]
pub async fn undo_delete(store: State<'_, Store>, id: String) -> Result<()> {
    store.delete_transaction(id, true).await
}
#[tauri::command]
pub async fn list_transactions(
    store: State<'_, Store>,
    filter: HistoryFilter,
) -> Result<HistoryPage> {
    store.history(filter).await
}
#[tauri::command]
pub async fn upsert_budget(
    store: State<'_, Store>,
    category_id: String,
    period: String,
    amount_text: String,
) -> Result<()> {
    store.upsert_budget(category_id, period, amount_text).await
}
#[tauri::command]
pub async fn delete_budget(store: State<'_, Store>, id: String, confirmed: bool) -> Result<()> {
    if !confirmed {
        return Err(AppError::validation("Confirm removal first."));
    }
    store.delete_budget(id).await
}
#[tauri::command]
pub async fn save_preferences(store: State<'_, Store>, input: Preferences) -> Result<()> {
    store.save_preferences(input).await
}
#[tauri::command]
pub async fn get_data_info(store: State<'_, Store>) -> Result<DataInfo> {
    store.data_info().await
}

async fn select_path(app: AppHandle, action: &'static str) -> Result<Option<std::path::PathBuf>> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file();
        let file = match action {
            "csv" => dialog
                .set_title("Export filtered transactions — choose a new file")
                .add_filter("CSV", &["csv"])
                .set_file_name(format!(
                    "FinTrack-{}.csv",
                    chrono::Local::now().format("%Y%m%d-%H%M%S")
                ))
                .blocking_save_file(),
            "backup" => dialog
                .set_title("Save unencrypted backup — choose a new file")
                .add_filter("FinTrack backup", &["sqlite"])
                .set_file_name(format!(
                    "FinTrack-backup-{}.sqlite",
                    chrono::Local::now().format("%Y%m%d-%H%M%S")
                ))
                .blocking_save_file(),
            _ => dialog
                .set_title("Inspect FinTrack backup")
                .add_filter("FinTrack backup", &["sqlite", "db", "backup"])
                .blocking_pick_file(),
        };
        file.map(|p| {
            p.into_path()
                .map_err(|_| AppError::validation("Select a local file."))
        })
        .transpose()
    })
    .await
    .map_err(|_| AppError::storage())?
}
#[tauri::command]
pub async fn create_backup(app: AppHandle, store: State<'_, Store>) -> Result<Option<String>> {
    let Some(path) = select_path(app, "backup").await? else {
        return Ok(None);
    };
    store.create_backup(&path).await?;
    Ok(Some(path.display().to_string()))
}
#[tauri::command]
pub async fn inspect_backup(
    app: AppHandle,
    store: State<'_, Store>,
) -> Result<Option<BackupPreview>> {
    let Some(path) = select_path(app, "restore").await? else {
        return Ok(None);
    };
    store.inspect_backup(&path).await.map(Some)
}
#[tauri::command]
pub async fn restore_backup(
    store: State<'_, Store>,
    token: String,
    confirmed: bool,
) -> Result<String> {
    store.restore_backup(token, confirmed).await
}
#[tauri::command]
pub async fn export_transactions_csv(
    app: AppHandle,
    store: State<'_, Store>,
    filter: HistoryFilter,
) -> Result<Option<String>> {
    let Some(path) = select_path(app, "csv").await? else {
        return Ok(None);
    };
    store.export_csv(filter, &path).await?;
    Ok(Some(path.display().to_string()))
}
