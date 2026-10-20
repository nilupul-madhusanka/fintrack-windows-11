import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AccountInput, Snapshot, TransactionInput } from "./types";

export const desktopAvailable = isTauri();
export const api = {
  snapshot: (period: string) => invoke<Snapshot>("get_snapshot", { period }),
  createAccount: (input: AccountInput) =>
    invoke<void>("create_account", { input }),
  createTransaction: (input: TransactionInput) =>
    invoke<void>("create_transaction", { input }),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error)
    return String(error.message);
  return typeof error === "string"
    ? error
    : "Something went wrong. Please try again.";
}
