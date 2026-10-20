# FinTrack — offline personal finance for Windows 11

Rust + Tauri 2 desktop software with an English interface, exact LKR accounting and local SQLite storage.

## Current release

**0.9.0 — MVP candidate.** The planned MVP features are implemented, all 27 automated tests pass, and this version has been installed and launched on the development Windows computer. The x64 NSIS installer bundles the offline WebView2 runtime. Broader acceptance checks are listed in [validation status](docs/TESTING.md). This candidate has not been code signed.

Installer output after building:

```text
src-tauri/target/release/bundle/nsis/FinTrack_0.9.0_x64-setup.exe
```

Close any earlier FinTrack window before installing or upgrading. Run the setup executable and open FinTrack from its Windows shortcut. The installer can provision WebView2 without downloading it at installation time.

## What you can do

- Create, edit and archive cash, bank, e-wallet and other cash-like accounts.
- Record, edit and duplicate income, expenses and transfers; confirm deletion and undo the most recent deletion in the current session.
- Create, rename, color-tag, archive and reactivate income/expense categories.
- Search and filter transactions by inclusive dates, kind, account or category, with 100 records per page.
- Track monthly category budgets, including approaching-limit and overspending indicators.
- View monthly totals, category spending and previous-month cash-flow comparisons.
- Export **all** records matching the selected history filters to spreadsheet-safe UTF-8 CSV.
- Create verified local SQLite backups; inspect a backup before restoring; automatically preserve and verify a safety backup of current data before replacement.
- Save your preferred name, light/dark/system theme, date format, start screen and compact-entry preference.

See the [user guide](docs/USER_GUIDE.md) for first use and recovery instructions.

## Accounting and privacy

LKR amounts use integer minor units in Rust and SQLite. Decimal strings cross the desktop interface; display formatting uses BigInt. Opening balances are not income. Transfers never count as income or expense. Balances include **all recorded dates and archived accounts**; the selected month affects cash flow and reports. Individual amounts are capped at LKR 999,999,999,999.99; final balances and summaries must fit signed 64-bit integers.

The database is normally `%LOCALAPPDATA%\io.fintrack.desktop\fintrack.sqlite`; Settings shows the actual location. There is no registration, cloud synchronization, bank integration, automatic upload or application analytics. Data, CSV files, backups and automatic safety copies are **unencrypted**. Protect your Windows account and keep separate backups. Deleted transactions are retained internally for undo and omitted from balances/reports/exports.

The uninstaller offers a separate **delete app data** option. Leave it unchecked to retain records. Updates retain data. Exported backups and CSV files remain wherever you saved them. These behaviors were reviewed in the generated installer script; clean-machine install/uninstall acceptance remains listed in the validation notes.

## Development

Prerequisites: Windows 11 x64, Rust stable/MSVC, Node.js 24 LTS, Microsoft C++ Build Tools/Windows SDK, and WebView2. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm ci
npm run tauri dev
```

A regular browser (`npm run dev`) cannot access the Rust database. For isolated debug data, set `FINTRACK_DEV_DATA_DIR` to a disposable folder before starting. Release builds always use the normal application data folder. A workspace file lock prevents two current app instances from opening the same profile.

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build
```

Dependencies are locked. Financial fixtures are fictional and disposable. Generated databases, exports, build output and backups are ignored by Git. Windows CI runs the build and test suite without publishing a release.

The original [project plan](FinTrack_Personal_Finance_Manager_Project_Plan.md), [development decisions](docs/DEVELOPMENT.md), [test results](docs/TESTING.md), and [release checklist](docs/RELEASE_CHECKLIST.md) document scope and remaining acceptance work.
