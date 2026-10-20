# Windows MVP release gates

## Completed in source / automated checks

- [x] All planned MVP feature screens and backend commands implemented.
- [x] Integer money, typed categories and transfers reconcile.
- [x] Previous foundation schema upgrades without losing records.
- [x] Backup restores into a fresh database and preserves budgets/preferences.
- [x] Safety snapshot can restore the previous dataset.
- [x] Corrupt/incompatible backups do not replace current records.
- [x] 10,000-record fixture measured; history paginates.
- [x] Frontend build/typecheck and component tests pass.
- [x] Strict Rust Clippy and formatting checks pass.
- [x] Native app icon and x64 NSIS installer with offline WebView2 runtime.
- [x] Uninstall data-deletion option reviewed in generated NSIS script.

## Acceptance still requiring execution

- [x] Execute the finalized 18-test integration suite (18 passed).
- [ ] Final native screen checks for forms, budgets, filtering, dark mode and dialogs.
- [x] Install final package and launch its installed executable.
- [x] Launch from the Windows shortcut and verify installed-app restart persistence.
- [ ] Exercise backup/restore and CSV through installed native dialogs.
- [ ] Verify operation with the development server stopped and network disconnected.
- [ ] Clean Windows 11 install/uninstall, upgrade and data-retention checks.
- [ ] Full keyboard/contrast audit on target display settings.

0.9.0 is an MVP candidate. Promote to 1.0 only after these acceptance gates are satisfied. Code signing and third-party license review are required before broad distribution; they are not silently assumed complete.
