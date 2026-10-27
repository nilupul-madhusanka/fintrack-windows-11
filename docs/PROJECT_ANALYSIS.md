# FinTrack project analysis — 27 October 2026

FinTrack is a local personal finance desktop app for Windows 11 x64. Its interface is English and its accounting currency is LKR. React and TypeScript provide the interface; Tauri 2 connects it to Rust commands and SQLx-managed SQLite storage.

## Implemented scope

- Cash, bank, e-wallet and other cash-like accounts, including opening balances, edits and archiving.
- Income, expenses and atomic transfers, transaction editing/duplication, confirmed deletion and session undo.
- Typed categories, monthly category budgets, spending breakdowns and previous-month comparisons.
- Search, date/kind/account/category filters, paginated history and complete filtered CSV exports.
- Verified SQLite backups, staged restore previews and a safety backup before replacement.
- Profile preferences, light/dark/system appearance and configurable date/start-screen settings.

## Engineering strengths

Rust parses money into integer minor units. Money crosses the desktop boundary as decimal strings and is formatted with BigInt in the interface. Rust accumulates summaries in i128 and checks i64 limits before committing changes. Transfers do not inflate income or expenses. SQLite constraints and migrations protect relationships, and a profile lock prevents simultaneous access by current app instances.

Recovery validates integrity, schema compatibility, foreign keys and domain values. CSV export quotes fields and neutralizes formula-like text. The interface uses a restricted content security policy and Rust-owned file dialogs. Source tests cover accounting, migration, recovery, pagination and component behavior.

## Portable distribution

The original NSIS package installs the app and can provision WebView2 offline. The new portable configuration uses Tauri's appDirectoriesOverride to place SQLite and the WebView2 profile under data/ beside the executable. This is a separate build configuration; installed builds keep their existing profile location.

The portable ZIP contains only the built executable, portable guide and changelog. It requires an already-installed Microsoft Edge WebView2 Runtime. It creates no bundled sample financial database. Moving the full extracted folder after closing the app carries the portable profile with it.

## Scope and release limits

No bank connection, cloud sync, registration, application analytics, multicurrency, recurring transactions or investment management is implemented. Data and backups are unencrypted. Version 0.9.1 remains an unsigned MVP prerelease pending clean-machine, disconnected-network and comprehensive native acceptance checks.

## Social artwork

docs/social/fintrack-linkedin-v0.9.1.png is an AI-generated LinkedIn announcement graphic using the existing green/ivory identity. The UI is an illustrative preview with fictional LKR values, explicitly labeled in the image. It is not a captured screenshot. The image highlights only implemented features and calls the release a portable preview. The generation prompt is saved alongside it.
