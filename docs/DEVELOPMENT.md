# Development notes

## Agreed product baseline

- Windows 11, x64.
- FinTrack, English interface, LKR with two decimal places.
- Tauri 2, React, TypeScript, Tailwind, Rust, SQLite via SQLx.
- Offline financial workflows; no account registration, telemetry, or banking integration.

## Plan assessment

The project blueprint provides a coherent MVP and useful acceptance tests. Follow its dependency order: exact money and persistence before advanced reports and recovery before a production release. The complete MVP is larger than the first development milestone.

The initial implementation creates a real desktop shell and a working slice: create an account, save income/expense/transfers through Rust, derive balances, and reopen the SQLite database without losing data. No fictional accounts or transactions are seeded into a user's database. Starter categories are seeded idempotently.

## Decisions

- Decimal inputs stay strings until Rust parses them. Minor-unit values cross IPC as strings and display through JavaScript BigInt.
- Opening balances may be negative. Transaction amounts must be positive. Individual amounts are capped at LKR 999,999,999,999.99; derived totals use checked i64 arithmetic.
- Account balances include all recorded transactions, including future dates. The UI labels this explicitly. Monthly flows use the selected calendar month.
- Database connections enable foreign keys; writes use a transaction and one connection to serialize validation and mutation.
- Local storage is unencrypted. Windows account security remains relevant; do not advertise encryption.
- The bundle identifier `io.fintrack.desktop` is provisional and should be settled before release.

## Later milestones

1. Account/category editing and archiving; transaction corrections, deletion confirmation, duplication and richer filters.
2. Budgets, spending breakdowns and reports.
3. Spreadsheet-safe CSV export and verified SQLite backup/restore with a safety copy.
4. Appearance/preferences, accessibility and 10,000-record performance checks.
5. Windows 11 installer, upgrade, offline and recovery smoke tests.

Do not describe this first slice as a completed MVP or use it as the sole copy of important financial records before backup/restore is delivered and tested.
