import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import type { Category, DataInfo, Preferences, Snapshot } from "../lib/types";
export function SettingsPanel({
  data,
  busy,
  save,
  addCategory,
  editCategory,
  archiveCategory,
  backup,
  restore,
}: {
  data: Snapshot;
  busy: boolean;
  save: (input: Preferences) => void;
  addCategory: () => void;
  editCategory: (category: Category) => void;
  archiveCategory: (category: Category) => void;
  backup: () => void;
  restore: () => void;
}) {
  const [input, set] = useState<Preferences>(data.preferences);
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  useEffect(() => {
    let live = true;
    api
      .dataInfo()
      .then((info) => {
        if (live) setInfo(info);
      })
      .catch((cause) => {
        if (live) setInfoError(errorMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [data]);
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <h2>Make it yours</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(input);
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Preferred name{" "}
              <span className="optional">optional, stored locally</span>
              <input
                maxLength={80}
                value={input.profileName}
                onChange={(e) => set({ ...input, profileName: e.target.value })}
              />
            </label>
            <label>
              Appearance
              <select
                value={input.theme}
                onChange={(e) =>
                  set({
                    ...input,
                    theme: e.target.value as Preferences["theme"],
                  })
                }
              >
                <option value="system">Use Windows setting</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Date display
              <select
                value={input.dateFormat}
                onChange={(e) =>
                  set({
                    ...input,
                    dateFormat: e.target.value as Preferences["dateFormat"],
                  })
                }
              >
                <option value="iso">YYYY-MM-DD</option>
                <option value="day-first">DD/MM/YYYY</option>
                <option value="month-first">MM/DD/YYYY</option>
              </select>
            </label>
            <label>
              Start screen
              <select
                value={input.startPage}
                onChange={(e) => set({ ...input, startPage: e.target.value })}
              >
                {[
                  "Dashboard",
                  "Transactions",
                  "Accounts",
                  "Budgets",
                  "Reports",
                  "Settings",
                ].map((page) => (
                  <option key={page}>{page}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={input.compactEntry}
                onChange={(e) =>
                  set({ ...input, compactEntry: e.target.checked })
                }
              />
              Compact entry (hide optional notes initially)
            </label>
            <button className="primary">Save preferences</button>
          </fieldset>
        </form>
        <div className="setting-row">
          <span>Currency / language</span>
          <strong>LKR / English</strong>
        </div>
        <div className="setting-row">
          <span>Version</span>
          <strong>0.9.0 · MVP candidate</strong>
        </div>
      </section>
      <section className="panel settings-card">
        <h2>Backup & recovery</h2>
        <p>
          Your records stay on this computer. FinTrack does not require an
          account or automatically upload records.
        </p>
        <p>
          Local data and backups are <strong>unencrypted</strong>. Anyone with
          access to your Windows account or storage device may be able to read
          them.
        </p>
        <div className="data-location">
          <strong>Data location</strong>
          <p>{info?.path ?? (infoError || "Loading…")}</p>
          <strong>Last verified backup</strong>
          <p>{info?.lastBackup ?? "No backup recorded yet."}</p>
        </div>
        <div className="button-row">
          <button className="primary" disabled={busy} onClick={backup}>
            Create backup
          </button>
          <button className="secondary" disabled={busy} onClick={restore}>
            Inspect & restore backup
          </button>
        </div>
        <p>
          Keep a second copy on a separate drive. Restore verifies the selected
          file and creates a safety backup before replacing records. Use a new
          filename when saving; existing files are never overwritten.
        </p>
        <p>
          CSV export is available in Transactions and exports every record
          matching the visible filters.
        </p>
      </section>
      <section className="panel settings-card categories-panel">
        <div className="section-heading">
          <div>
            <h2>Categories</h2>
            <p>Archive to stop using a category while keeping its history.</p>
          </div>
          <button className="secondary" disabled={busy} onClick={addCategory}>
            Add category
          </button>
        </div>
        {(["expense", "income"] as const).map((kind) => (
          <div className="category-group" key={kind}>
            <h3>{kind}</h3>
            {data.categories
              .filter((c) => c.kind === kind)
              .map((category) => (
                <div className="category-line" key={category.id}>
                  <span
                    className="color-dot"
                    style={{ background: category.color ?? "#39815d" }}
                  />
                  <span>
                    {category.name}
                    {category.isArchived ? " · archived" : ""}
                  </span>
                  <div className="row-actions">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => editCategory(category)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => archiveCategory(category)}
                    >
                      {category.isArchived ? "Reactivate" : "Archive"}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}
