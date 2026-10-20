mod commands;
pub mod domain;
pub mod error;
mod ledger;
pub mod models;
pub mod recovery;
pub mod store;
use models::{AccountInput, Snapshot, TransactionInput};
use store::Store;
use tauri::{Manager, State};

#[tauri::command]
async fn get_snapshot(store: State<'_, Store>, period: String) -> error::Result<Snapshot> {
    store.snapshot(&period).await
}
#[tauri::command]
async fn create_account(store: State<'_, Store>, input: AccountInput) -> error::Result<()> {
    store.create_account(input).await
}
#[tauri::command]
async fn create_transaction(store: State<'_, Store>, input: TransactionInput) -> error::Result<()> {
    store.create_transaction(input).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = if cfg!(debug_assertions) {
                std::env::var_os("FINTRACK_DEV_DATA_DIR")
                    .map(std::path::PathBuf::from)
                    .unwrap_or(app.path().app_local_data_dir()?)
            } else {
                app.path().app_local_data_dir()?
            };
            std::fs::create_dir_all(&directory)?;
            let instance_lock = std::fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(directory.join("fintrack.lock"))?;
            instance_lock.try_lock().map_err(|_| {
                error::AppError::validation(
                    "FinTrack is already open for this workspace. Return to its existing window.",
                )
            })?;
            app.manage(instance_lock);
            let store =
                tauri::async_runtime::block_on(Store::open(&directory.join("fintrack.sqlite")))?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            create_account,
            create_transaction,
            commands::update_account,
            commands::archive_record,
            commands::save_category,
            commands::update_transaction,
            commands::delete_transaction,
            commands::undo_delete,
            commands::list_transactions,
            commands::upsert_budget,
            commands::delete_budget,
            commands::save_preferences,
            commands::get_data_info,
            commands::create_backup,
            commands::inspect_backup,
            commands::restore_backup,
            commands::export_transactions_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
