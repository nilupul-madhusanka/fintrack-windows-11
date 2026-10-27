# Changelog

## 0.9.1 — 27 October 2026 — portable prerelease

- Portable Windows x64 ZIP; no FinTrack installation required.
- Database, workspace lock and WebView2 profile kept in a data folder beside the executable.
- Repeatable portable packaging, SHA256 checksum, and version-tagged GitHub prerelease workflow.
- Portable usage, backup, update and WebView2 prerequisite documentation.
- Existing installed edition retains its usual data location. Broader acceptance gates remain open.

## 0.9.0 — 20 October 2026 — MVP candidate

- Account and typed-category editing, archiving and reactivation.
- Transaction editing, duplication, confirmed deletion and undo.
- Search, filters, paginated history and full filtered CSV export.
- Monthly budgets, spending breakdown and previous-month reports.
- Verified SQLite backup and staged, atomic restore with a recoverable safety copy.
- Persistent profile, appearance, date format, start-screen and compact-entry preferences.
- Additional finance/recovery/migration/performance tests and component coverage.
- Custom app icon and x64 Windows NSIS package bundling offline WebView2.
- All 27 automated tests pass; installer and installed application launch verified locally. Broader release acceptance remains tracked separately.

## 0.1.0 — 20 October 2026

- Tauri/React shell, Rust financial domain, SQLite foundation, account creation and income/expense/transfer entry.
