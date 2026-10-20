# Foundation validation — 20 October 2026

## Automated checks

- Frontend production build and TypeScript validation.
- Four frontend tests: exact money display beyond JavaScript's safe integer range, account submission, Rust error feedback and duplicate-submit prevention.
- Two Rust unit tests for decimal parsing, bounds, real calendar dates and month intervals.
- Seven SQLite integration tests: blueprint reconciliation and reopening, invalid writes, archived accounts/destination start dates, negative balances/month boundaries, schema constraints, overflow rollback and camelCase/string-money IPC DTO shape.
- Rust format and Clippy with warnings denied.

The reconciliation fixture opens Cash at LKR 10,000 and Bank at LKR 40,000; adds Bank income of LKR 20,000, a Cash expense of LKR 3,500 and Bank-to-Cash transfer of LKR 2,000. Expected Cash is LKR 8,500, Bank LKR 58,000, total LKR 66,500 and monthly net flow LKR 16,500.

## Desktop smoke check

**Passed on Windows on 20 October 2026.** Used `.local/desktop-smoke` with `FINTRACK_DEV_DATA_DIR` so fictional entries did not reach the normal profile. Verified empty startup, created a Cash account at LKR 10,000, recorded an expense of LKR 1,250.50, confirmed balance LKR 8,749.50 and net cash flow −LKR 1,250.50. Closed and relaunched the Tauri app; account, transaction and summary values persisted unchanged. Inspected the actual WebView2 window and account dialog visually and through accessibility text.

## Outstanding release validation

- Full MVP functionality, correction workflows and restore safety are not implemented yet.
- Offline behavior without development servers, clean Windows 11 installation, installer upgrades and retention must be verified on a packaged build.
- Benchmark 10,000 records; the first slice reads the ledger into Rust for exact aggregation. Optimize and add paginated history before claiming scale targets.
- Full accessibility and contrast audit, dark theme, custom release icon and code signing remain open.
