import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AccountInput,
  Snapshot,
  TransactionInput,
  CategoryInput,
  HistoryFilter,
  HistoryPage,
  Preferences,
  BackupPreview,
  DataInfo,
} from "./types";

export const desktopAvailable = isTauri();
export const api = {
  snapshot: (period: string) => invoke<Snapshot>("get_snapshot", { period }),
  createAccount: (input: AccountInput) =>
    invoke<void>("create_account", { input }),
  createTransaction: (input: TransactionInput) =>
    invoke<void>("create_transaction", { input }),
  updateAccount: (id: string, input: AccountInput, confirmBalance: boolean) =>
    invoke<void>("update_account", { id, input, confirmBalance }),
  archive: (entity: "account" | "category", id: string, archived: boolean) =>
    invoke<void>("archive_record", { entity, id, archived }),
  saveCategory: (id: string | null, input: CategoryInput) =>
    invoke<void>("save_category", { id, input }),
  updateTransaction: (id: string, input: TransactionInput) =>
    invoke<void>("update_transaction", { id, input }),
  deleteTransaction: (id: string) =>
    invoke<void>("delete_transaction", { id, confirmed: true }),
  undoDelete: (id: string) => invoke<void>("undo_delete", { id }),
  history: (filter: HistoryFilter) =>
    invoke<HistoryPage>("list_transactions", { filter }),
  saveBudget: (categoryId: string, period: string, amountText: string) =>
    invoke<void>("upsert_budget", { categoryId, period, amountText }),
  deleteBudget: (id: string) =>
    invoke<void>("delete_budget", { id, confirmed: true }),
  savePreferences: (input: Preferences) =>
    invoke<void>("save_preferences", { input }),
  dataInfo: () => invoke<DataInfo>("get_data_info"),
  backup: () => invoke<string | null>("create_backup"),
  inspectBackup: () => invoke<BackupPreview | null>("inspect_backup"),
  restore: (token: string) =>
    invoke<string>("restore_backup", { token, confirmed: true }),
  exportCsv: (filter: HistoryFilter) =>
    invoke<string | null>("export_transactions_csv", { filter }),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error)
    return String(error.message);
  return typeof error === "string"
    ? error
    : "Something went wrong. Please try again.";
}
