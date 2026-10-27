# FinTrack portable — Windows 11 x64

Version 0.9.1 is an unsigned MVP prerelease. Broader clean-machine and disconnected-network acceptance is still pending; see the project's release checklist.

## First launch

1. Extract the entire ZIP to a folder you can write to, such as Documents or a USB drive. Do not run the application from inside the ZIP or from Program Files.
2. Open FinTrack.exe. No FinTrack installer or administrator account is required.
3. Create an account and start tracking LKR income, expenses, transfers and monthly budgets.

Microsoft Edge WebView2 Runtime must already be installed. This small ZIP does not include it. If your machine lacks WebView2, provision Microsoft's runtime separately before using the app offline. Windows may show an unknown-publisher warning because this candidate is not code signed; follow your organization's software policy.

## Where your data lives

The application creates a data folder beside FinTrack.exe. It contains fintrack.sqlite, the workspace lock, SQLite journal files, and the WebView2 browser profile/cache. Settings displays the actual database path. Portable mode does not automatically read or change the installed edition's profile.

Keep the entire folder together when moving the app. Fully close FinTrack before copying it or safely ejecting a drive. Do not run one portable profile concurrently on multiple computers or through a cloud-synced/network folder.

Records and backups are unencrypted. Anyone with access to the drive can read them. Keep a verified backup on a separate drive using Settings > Backup. The app performs no bank integration, cloud sync, account registration or application analytics.

## Update or switch editions

Back up first and close FinTrack. Extract the new release to a new folder, then move your existing data folder beside the new executable. Never replace your data folder with an empty one. Keep the old copy until you have checked the new version.

To move records between the installed and portable editions, create a backup in the source edition and use Settings to inspect and restore it in the destination edition. Files exported through save dialogs remain at the locations you choose.

Deleting this portable folder also deletes any records and safety backups inside it. Save a separate backup before removing it.

Project: https://github.com/nilupul-madhusanka/fintrack-windows-11
