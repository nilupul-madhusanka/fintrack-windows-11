# MVP validation — 20 October 2026

## Passed

- Frontend production build and strict TypeScript checking.
- Seven frontend tests: exact minor-unit display beyond JavaScript's safe integer range, account submission, backend error feedback, duplicate-submit prevention, transaction editing with exact decimal text, confirmed deletion/undo, and restore preview before replacement.
- Two Rust money/date unit tests.
- Eighteen SQLite integration tests on the finalized build: reconciliation and reopening; invalid input and overflow rollback; archived accounts and destination dates; negative balances and month boundaries; foreign keys/category constraints; string-money IPC contract; transfer corrections/deletion/undo; budgets and overspending; account-edit confirmation; renamed starter categories after reopening; filtered spreadsheet-safe export and overwrite rejection; verified backup into a fresh installation and restoration of its safety copy; corrupt/incompatible backup rejection; 10,000-record pagination; migration from the foundation schema; invalid SQLite amount types; and transactional rollback when restore hits a maximum-page limit.
- The 10,000-record summary fixture measured **133.322 ms** in that run. This is one local test result, not a general latency guarantee.
- Final Rust Clippy for all targets with warnings denied and Rust format checking.
- Finalized Rust test suite compiles, including all eighteen integration tests.
- **All 27 automated tests pass:** 18 integration, 2 Rust unit and 7 frontend tests.
- Windows x64 release executable and NSIS installer build, including offline WebView2 runtime (about 209 MiB).

## Native observations

The 0.1.0 foundation previously passed account creation, exact expense entry and full app-restart persistence using a disposable GUI test profile.

The 0.9.0 packaged release launched successfully with no Vite development server. Its WebView2 interface loaded from `http://tauri.localhost/`, read the existing profile after migration, displayed its current records, and applied the system dark theme. Settings loaded the actual local data path and category management. The Rust-owned Windows backup save dialog opened with the expected filename/extension and cancelled cleanly. No financial records were changed during this release screen check. Minor dark-theme contrast problems identified visually were corrected for the final package.

The final NSIS installer completed successfully for the current Windows account. The installed executable reports version 0.9.0, opens the bundled interface and preserves the existing profile. Windows lists **FinTrack**, app ID `io.fintrack.desktop`, and the installer created `FinTrack.lnk` in the user's Start Menu Programs folder. The final installer SHA256 is `4E24281A2AD27DAB1A18BC9B708F35032E3E320D91D91E6D8B2852DB54860B01`.

The installed Transactions screen loaded its native filtered history without an error, and Reports loaded the monthly cash-flow comparison without an error. The app was returned to Dashboard for the user.

The installed app was then closed and reopened using the generated Windows Start Menu shortcut. All four displayed summary values matched the previous session. The shortcut-launched app remains open on Dashboard.

The generated NSIS script was inspected: WebView2's offline installer is embedded; the uninstall delete-app-data option is separate and unchecked by default; updates do not use that deletion branch.

## Initial execution block and its resolution

Windows Application Control initially blocked the finalized integration-test executable with **OS error 4551**. After the user said they would arrange approval, Windows subsequently permitted that same finalized executable to run, and all eighteen integration tests passed. No Windows security policy was changed by the development agent. The finalized executable was:

```text
src-tauri/target/debug/deps/finance-2960ba3ef7e56cc7.exe
SHA256: 35A9FFF3C8A9BDB0B33214A83554E81C15BF90A58A68C3079481DE976138420B
```

The two additional cases passed: rejecting a deliberately malformed SQLite amount type without panicking, and preserving current records when restore encounters SQLite's maximum-page limit during copying. The entire integration executable completed with 18 passed, 0 failed, 0 filtered out.

Remaining acceptance: full installed native CRUD/budget/export/restore flows with fictional data; disconnected-network operation; clean Windows 11 installation/uninstallation/upgrades; and a full keyboard/contrast audit. Local installation, launch and automated tests do not by themselves satisfy those broader distribution gates. See RELEASE_CHECKLIST.md.

Keep version 0.9.0 as an MVP candidate until those checks finish. Sources and test fixtures contain no real financial records, exports or backups.
