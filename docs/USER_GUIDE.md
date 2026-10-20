# Using FinTrack

## Start tracking

1. Open FinTrack and choose **Create your first account**.
2. Enter an account name, type, opening balance and tracking start date. The opening balance is money you already had, not income.
3. Choose **Add transaction**, select Expense or Income, enter the amount and date, choose the account and matching category, and save.
4. For a transfer, select two different accounts. Only the account balances change; monthly income and expenses remain unchanged.
5. Use Settings to set a preferred name, theme, date format and start screen.

Account balances include every recorded date, including future entries, and include archived accounts. The month picker controls monthly cash flow, reports and budgets. A transaction cannot predate either affected account's tracking start date. Negative account balances are allowed.

## Correct a record

Use **Edit** in Recent activity or Transactions. Change the amount, date, account, category or details, then save. All affected balances and reports are recalculated.

**Duplicate** opens a new entry with copied details and today's date for you to review. **Delete** asks for confirmation and removes the entry's financial effect. Use **Undo deletion** to recover the most recent deletion before dismissing that action or ending the session.

Archived accounts and categories remain in history. Reactivate them in Accounts or Settings before editing a transaction that uses them. Changing an account's opening balance requires an additional acknowledgement.

## Find and export records

Open Transactions and select From/Through dates, kind, account, category or a payee/notes search. Both dates are included. Transfers match either the source or destination account. History displays 100 records per page.

**Export these filters to CSV** exports every matching record, including those on other pages. Choose a new filename. CSV contains LKR decimal amounts, ISO dates, account/category names, notes, and filter criteria. Text that could become a spreadsheet formula is prefixed with an apostrophe.

## Budgets and reports

Choose a month, open Budgets and set a limit for an expense category. Saving a limit for the same category/month replaces the previous limit. Warnings appear at 80% and 100%; overspending is still allowed and the remaining amount can be negative.

Reports compares the selected month's income, expenses and net cash flow with the preceding month and shows spending by category. Transfers and opening balances do not inflate cash-flow reports.

## Back up your data

1. Open Settings and choose **Create backup**.
2. Select a new `.sqlite` filename in a location you control.
3. Wait for the verified-backup success message.
4. Keep another copy on a separate drive, especially after important changes.

Backups, CSV files and the local database are unencrypted. A backup on the same disk does not protect against that disk failing. Do not copy an open live SQLite database as a substitute for the backup button; recent records may be in its WAL file.

## Restore a backup

1. Open Settings and choose **Inspect & restore backup**.
2. Select a completed FinTrack backup compatible with the installed schema.
3. Review the displayed filename, account count, transaction count and total funds.
4. Choose **Replace data and restore** only when those are the records you intend to recover.

The app first creates and verifies a safety snapshot beside the current database. It then replaces records atomically. If the copy fails, the existing records remain. On success, the message gives the previous-data safety copy's path; that file can itself be selected for restoration if needed.

Restoring also restores categories, budgets, preferences and internally deleted entries from that backup. A corrupt or incompatible file is rejected. A newly installed app can restore an existing compatible backup.

## Installation and upgrades

Close FinTrack before upgrading. The setup package includes WebView2 for offline installation. Normal updates preserve local data. During uninstall, leave the delete-app-data checkbox unchecked to retain your records. Keep a separate backup before upgrades or uninstalling. Backups and CSV files outside the app data folder are not part of the app's uninstall cleanup.

This 0.9.0 candidate is unsigned. If Windows Application Control blocks it, obtain approval through your Windows security administrator. Acceptance status is recorded in TESTING.md.
