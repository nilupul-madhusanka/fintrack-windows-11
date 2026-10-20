# FinTrack

An offline personal finance desktop app for **Windows 11 (x64)**, built with Rust, Tauri 2, React, TypeScript, Tailwind CSS and SQLite/SQLx. English interface; LKR accounting currency.

## Development status

**0.1.0 foundation**, under active development. The original [project plan](FinTrack_Personal_Finance_Manager_Project_Plan.md) describes the full MVP; this repository implements its first working slice.

Implemented:

- Desktop navigation, first-account setup, accounts, transaction entry, monthly history and summary.
- Cash, bank, e-wallet and other cash-like accounts with signed opening balances.
- Income, expenses and atomic single-record transfers.
- Exact minor-unit arithmetic, Rust validation and string-based money transport to the interface.
- Versioned SQLite migration, starter categories, foreign keys and persistence.
- Unit, integration and component tests using fictional data only.

Still planned: account/category editing and archiving, transaction editing/deletion, full filtering/paging, budgets, reports, CSV export, verified backup/restore, dark mode and tested Windows installers. **This is not a completed MVP.**

## Run locally

Install Rust stable with the MSVC toolchain, Node.js 24 LTS or compatible, Microsoft C++ Build Tools/Windows SDK and WebView2. See [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

From the project folder:

```powershell
npm ci
npm run tauri dev
```

The desktop window opens with an empty account list. Add your first account and opening balance, then add a transaction. `npm run dev` opens only the frontend; a regular browser cannot access the Rust database and displays an explanation.

Current machine note: Windows Application Control blocked the final rebuilt debug executable with OS error 4551 after earlier successful desktop checks. The app is not currently running. See [validation notes](docs/TESTING.md) for the observed limitation.

## Checks

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

The frontend build includes TypeScript checking. Rust integration tests create disposable SQLite files and check the plan's exact reconciliation scenario, reopening, date/category/account validation, foreign keys, month boundaries and overflow rollback.

## Data and privacy

The normal database is `fintrack.sqlite` under Tauri's Windows local application data directory for `io.fintrack.desktop` (normally `%LOCALAPPDATA%\io.fintrack.desktop`). No registration, automatic upload, bank integration or telemetry is implemented. Data and backups are **not encrypted**. Backup/restore is not yet available; keep separate copies of important records while this is in development.

Balances include **all recorded dates**, including future entries and archived accounts. The selected month affects income, expenses, net cash flow and recent history only. Opening balances are not income; transfers never count as income or expense. History currently displays the latest 100 entries per selected month; summaries include every entry.

For an isolated development database, set `FINTRACK_DEV_DATA_DIR` before `npm run tauri dev`. This override is honored only by debug builds. GUI smoke checks use `.local/desktop-smoke`, which is ignored by Git.

## Build

```powershell
npm run tauri build
```

NSIS packaging is configured, but release packaging, signing, clean installation, upgrades and recovery remain later milestone gates. The current icon is the starter icon and the bundle identifier is provisional.

See [development decisions](docs/DEVELOPMENT.md) and [validation results](docs/TESTING.md).
