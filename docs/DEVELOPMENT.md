# MVP development decisions

## Baseline

Windows 11 x64, English, LKR, two decimal places. Tauri 2, React, TypeScript, Tailwind and Rust-managed SQLite/SQLx. The original plan's post-MVP recurring records, savings goals, liabilities, imports, multicurrency and sync are excluded.

## Implemented milestones

1. Desktop shell, first account and exact money domain.
2. SQLite migrations, foreign keys, account and category management.
3. Income, expenses, atomic transfers, corrections, duplication and recoverable deletion.
4. Search, date/kind/account/category filters, pagination, monthly summaries and category reports.
5. Monthly budgets, including negative remaining amounts when overspent.
6. CSV export, verified backup/restore, preferences and light/dark themes.
7. Custom app icon, Windows x64 NSIS packaging and embedded offline WebView2 runtime.

## Financial boundary

- Rust parses decimal input without floating point. IPC money fields are strings.
- i128 accumulation prevents order-dependent intermediate overflow; final balances and monthly summaries are checked against i64 before mutation commits.
- Balances include future-dated records and archived accounts. The interface labels this scope.
- Transfers occupy one row and never affect income or expenses.
- Accounts with history are archived rather than deleted. Changing opening balances requires confirmation, and tracking dates cannot move after an existing transaction.
- Categories have immutable kind. Renaming a starter category does not recreate its old name at restart.
- Transactions use a `deleted_at` marker and disappear from totals/history/export; the latest deletion can be undone in the current session.
- Editing an entry with an archived account/category requires reactivation. Historical association is retained.

## Storage and recovery

Migration `0001_initial.sql` is preserved. `0002_mvp.sql` adds soft deletion. Upgrade tests reproduce a database from the first migration and verify records remain intact.

One pool connection serializes validation and writes inside the app. A Windows file lock prevents a second current app instance using the same profile. Every financial mutation is transactional and revalidates derived totals before commit.

Backups use SQLite `VACUUM INTO`, file synchronization, integrity/foreign-key checks, schema/migration comparison and domain validation. Save operations require a new filename. The frontend cannot provide arbitrary filesystem paths; Rust-owned native dialogs select backup/export locations.

Restore copies the selected snapshot to a private staging file, then validates it. The interface presents verified counts and total funds before confirmation. Confirmation references an opaque, one-use token, so changes to the original selected file cannot change what is restored. A synchronized, integrity-checked safety snapshot is created before replacement. Data is copied through trusted tables and constraints in one SQLite transaction; the database file and schema are not overwritten. A failed copy rolls back. Current-schema backups are supported; incompatible or corrupt backups are refused.

CSV exports the full filtered result in a consistent read transaction. Fields are quoted, quotes/newlines preserved, and formula-like text prefixed for spreadsheet safety. Filter criteria are included in each exported record. All exports use LKR and ISO dates.

## Validation and release status

See TESTING.md for exact results. Windows Application Control initially blocked the finalized integration executable; it subsequently ran successfully with all 18 integration tests passing. No security policy was modified by the development agent. Including two unit tests and seven frontend tests, all 27 automated tests pass. The final installer completed successfully for the user's Windows account, and the installed application launched from its bundled files. Version 0.9.0 remains an MVP candidate pending broader clean-machine, disconnected-network and full installed-workflow acceptance. No code-signing certificate has been supplied.
