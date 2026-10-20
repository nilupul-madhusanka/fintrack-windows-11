import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Wallet,
  X,
  ChartPie,
  Target,
} from "lucide-react";
import { api, desktopAvailable, errorMessage } from "./lib/api";
import { localDate, money, monthFilter, displayDate } from "./lib/money";
import type {
  Account,
  Budget,
  Category,
  BackupPreview,
  HistoryFilter,
  Preferences,
  Snapshot,
  Transaction,
} from "./lib/types";
import { Modal } from "./components/Modal";
import {
  AccountForm,
  BudgetForm,
  CategoryForm,
  TransactionForm,
} from "./components/Forms";
import { History, TransactionTable } from "./components/History";
import { BudgetCards, Reports, SpendingBars } from "./components/Reports";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

type Page =
  | "Dashboard"
  | "Transactions"
  | "Accounts"
  | "Budgets"
  | "Reports"
  | "Settings";
const navigation = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Transactions", icon: ReceiptText },
  { name: "Accounts", icon: Wallet },
  { name: "Budgets", icon: Target },
  { name: "Reports", icon: ChartPie },
  { name: "Settings", icon: Settings },
] as const;
const defaults: Preferences = {
  theme: "system",
  dateFormat: "iso",
  profileName: "",
  startPage: "Dashboard",
  compactEntry: false,
};
type Editor =
  | { type: "account"; original?: Account }
  | { type: "transaction"; original?: Transaction }
  | { type: "category"; original?: Category }
  | { type: "budget"; original?: Budget }
  | {
      type: "confirm";
      title: string;
      message: string;
      action: () => Promise<void>;
    }
  | { type: "restore"; preview: BackupPreview };

export default function App() {
  const [page, setPage] = useState<Page>("Dashboard"),
    [period, setPeriod] = useState(localDate().slice(0, 7));
  const [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null),
    [pending, setPending] = useState(false),
    [formError, setFormError] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>(() =>
      monthFilter(period),
    ),
    [revision, setRevision] = useState(0),
    [undo, setUndo] = useState<string | null>(null);
  const saving = useRef(false),
    generation = useRef(0),
    initialized = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    if (!desktopAvailable) {
      setLoading(false);
      return;
    }
    try {
      const result = await api.snapshot(period);
      if (request === generation.current) {
        result.preferences ??= defaults;
        result.budgets ??= [];
        result.spending ??= [];
        setData(result);
        setRevision((v) => v + 1);
        if (!initialized.current) {
          initialized.current = true;
          if (navigation.some((n) => n.name === result.preferences.startPage))
            setPage(result.preferences.startPage as Page);
        }
      }
    } catch (cause) {
      if (request === generation.current) {
        setData(null);
        setError(errorMessage(cause));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    setData(null);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setFilter(monthFilter(period));
  }, [period]);
  const theme = data?.preferences?.theme ?? "system";
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  function open(value: Editor) {
    setFormError("");
    setEditor(value);
  }
  async function run(
    action: () => Promise<unknown>,
    message: string,
    close = true,
  ) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError("");
    setFormError("");
    try {
      await action();
      if (close) setEditor(null);
      if (message) setNotice(message);
      await refresh();
    } catch (cause) {
      if (editor) setFormError(errorMessage(cause));
      else setError(errorMessage(cause));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const ready = desktopAvailable && !!data && !loading && !pending;
  const activeAccounts = data?.accounts.filter((a) => !a.isArchived) ?? [];
  const addTransaction = () => open({ type: "transaction" });
  const addAccount = () => open({ type: "account" });
  const edit = (row: Transaction) =>
    open({ type: "transaction", original: row });
  const duplicate = (row: Transaction) =>
    open({
      type: "transaction",
      original: { ...row, id: "", transactionDate: localDate() },
    });
  const remove = (row: Transaction) =>
    open({
      type: "confirm",
      title: "Delete transaction?",
      message: `Remove this ${row.kind} of ${money(row.amountMinor)} and reverse its financial effect? You can undo this deletion using the Undo button.`,
      action: async () => {
        await api.deleteTransaction(row.id);
        setUndo(row.id);
      },
    });
  const archiveAccount = (account: Account) =>
    open({
      type: "confirm",
      title: account.isArchived ? "Reactivate account?" : "Archive account?",
      message: account.isArchived
        ? "This account will be available for new transactions."
        : "Existing history and balances remain included in your total. New entries will require reactivation.",
      action: () => api.archive("account", account.id, !account.isArchived),
    });
  const archiveCategory = (category: Category) =>
    open({
      type: "confirm",
      title: category.isArchived ? "Reactivate category?" : "Archive category?",
      message:
        "Historical transactions and budgets keep their category. Archived categories cannot be selected for new records.",
      action: () => api.archive("category", category.id, !category.isArchived),
    });
  async function inspect() {
    await run(
      async () => {
        const preview = await api.inspectBackup();
        if (preview) open({ type: "restore", preview });
      },
      "",
      false,
    );
  }
  const exportCsv = () =>
    void run(async () => {
      const path = await api.exportCsv(filter);
      setNotice(path ? `CSV saved: ${path}` : "Export cancelled.");
    }, "");
  function changePeriod(value: string) {
    if (/^\d{4}-\d{2}$/.test(value)) setPeriod(value);
  }
  return (
    <div className="app-shell" aria-busy={pending || loading}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#dashboard"
          onClick={() => setPage("Dashboard")}
        >
          <span className="brand-mark">
            <ChartNoAxesCombined size={25} />
          </span>
          FinTrack<span className="brand-dot">.</span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              disabled={pending}
              className={page === name ? "nav-item active" : "nav-item"}
              aria-current={page === name ? "page" : undefined}
              onClick={() => setPage(name)}
            >
              <Icon size={19} />
              {name}
              {page === name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="coming-next">
          <span className="version-tag">v0.9.0 · MVP candidate</span>
        </div>
        <div className="local-card">
          <ShieldCheck size={22} />
          <strong>Yours. Always.</strong>
          <p>
            Your records stay on this computer. Keep a separate backup for peace
            of mind.
          </p>
          <span>
            <i />
            Offline by design
          </span>
        </div>
        <div className="profile">
          <span className="avatar">
            {data?.preferences?.profileName.slice(0, 1) || "F"}
          </span>
          <div>
            <strong>
              {data?.preferences?.profileName || "Personal workspace"}
            </strong>
            <small>English · LKR</small>
          </div>
          <LockKeyhole size={15} />
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Personal finance <ChevronRight size={14} />
            <strong>{page}</strong>
          </span>
          <span className="local-badge">
            <i />
            Local workspace
          </span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE CLARITY, EVERY DAY</div>
              <h1>
                {page === "Dashboard" ? "Your money, at a glance." : page}
              </h1>
              <p>
                {page === "Dashboard"
                  ? "A clear picture of what you have and where it goes."
                  : page === "Budgets"
                    ? "A plan for your spending, one month at a time."
                    : page === "Reports"
                      ? "Understand your income, expenses, and monthly cash flow."
                      : page === "Settings"
                        ? "A private workspace, built around you."
                        : "The details behind your day-to-day finances."}
              </p>
            </div>
            <div className="heading-actions">
              {["Dashboard", "Transactions", "Budgets", "Reports"].includes(
                page,
              ) && (
                <label className="month-label">
                  <span className="sr-only">Report month</span>
                  <input
                    aria-label="Report month"
                    type="month"
                    value={period}
                    min="0001-01"
                    max="9998-12"
                    disabled={pending || loading}
                    required
                    onChange={(e) => changePeriod(e.target.value)}
                  />
                </label>
              )}
              {page !== "Settings" && (
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={
                    page === "Accounts" || !activeAccounts.length
                      ? addAccount
                      : page === "Budgets"
                        ? () => open({ type: "budget" })
                        : addTransaction
                  }
                >
                  <Plus size={17} />
                  {page === "Accounts" || !activeAccounts.length
                    ? "Add account"
                    : page === "Budgets"
                      ? "Set budget"
                      : "Add transaction"}
                </button>
              )}
            </div>
          </div>
          {!desktopAvailable && (
            <div className="info-banner">
              <CircleHelp size={21} />
              <div>
                <strong>Open FinTrack as a desktop app</strong>
                <p>
                  Launch the Windows application to create accounts and save
                  records in the local database.
                </p>
              </div>
            </div>
          )}
          {loading && (
            <p role="status" className="status-box">
              Opening your local workspace…
            </p>
          )}
          {pending && (
            <p role="status" className="status-box">
              Working… Please finish any open file dialog.
            </p>
          )}
          {error && (
            <div role="alert" className="error-box">
              {error}
              <button
                className="text-button"
                disabled={pending}
                onClick={() => void refresh()}
              >
                Refresh workspace
              </button>
            </div>
          )}
          {notice && (
            <div className="success-box" role="status">
              <Check size={17} />
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {undo && (
            <div className="info-banner">
              <span>Transaction deleted.</span>
              <button
                className="text-button"
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    await api.undoDelete(undo);
                    setUndo(null);
                  }, "Deletion undone.")
                }
              >
                Undo deletion
              </button>
              <button className="text-button" onClick={() => setUndo(null)}>
                Dismiss undo
              </button>
            </div>
          )}
          {ready && data && !data.accounts.length && page !== "Settings" && (
            <section className="welcome-card">
              <div className="welcome-icon">
                <Wallet size={31} />
              </div>
              <div>
                <span className="eyebrow">WELCOME TO FINTRACK</span>
                <h2>Start with what you have.</h2>
                <p>
                  Add your cash, bank, or e-wallet account and its opening
                  balance.
                  <br />
                  Then record your first transaction. We’ll take care of the
                  totals.
                </p>
                <button className="primary" onClick={addAccount}>
                  <Plus size={17} />
                  Create your first account
                </button>
              </div>
              <span className="welcome-decoration" aria-hidden="true">
                ↗
              </span>
            </section>
          )}
          {data && !loading && (
            <>
              {page === "Dashboard" && (
                <>
                  <section
                    className="stats-grid"
                    aria-label="Financial summary"
                  >
                    {[
                      {
                        label: "Total tracked balance",
                        value: data.totalTrackedBalanceMinor,
                        icon: Wallet,
                        detail: "All accounts · all recorded dates",
                        style: "balance",
                      },
                      {
                        label: "Monthly income",
                        value: data.incomeMinor,
                        icon: ArrowDownLeft,
                        detail: "Money received this month",
                        style: "income",
                      },
                      {
                        label: "Monthly expenses",
                        value: data.expenseMinor,
                        icon: ArrowUpRight,
                        detail: "Money spent this month",
                        style: "expense",
                      },
                      {
                        label: "Net cash flow",
                        value: data.netCashFlowMinor,
                        icon: ArrowLeftRight,
                        detail: "Income minus expenses",
                        style: "net",
                      },
                    ].map(({ label, value, icon: Icon, detail, style }) => (
                      <article className={`stat-card ${style}`} key={label}>
                        <div className="stat-title">
                          {label}
                          <Icon size={18} />
                        </div>
                        <strong className="stat-value">{money(value)}</strong>
                        <small>{detail}</small>
                      </article>
                    ))}
                  </section>
                  <div className="dashboard-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Your accounts</h2>
                          <p>
                            Includes archived accounts and future-dated entries.
                          </p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setPage("Accounts")}
                        >
                          Manage <ChevronRight size={15} />
                        </button>
                      </div>
                      {data.accounts.map((a) => (
                        <div className="account-line" key={a.id}>
                          <span className="account-icon">
                            <Wallet size={19} />
                          </span>
                          <div>
                            <strong>{a.name}</strong>
                            <small>
                              {a.accountType}
                              {a.isArchived ? " · archived" : ""}
                            </small>
                          </div>
                          <strong className="amount">
                            {money(a.balanceMinor)}
                          </strong>
                        </div>
                      ))}
                      {!data.accounts.length && (
                        <div className="quiet-empty">
                          Your accounts will appear here.
                        </div>
                      )}
                      <button
                        className="add-account-line"
                        disabled={!ready}
                        onClick={addAccount}
                      >
                        <Plus size={16} />
                        Add an account
                      </button>
                    </section>
                    <SpendingBars data={data} />
                  </div>
                  {!!data.budgets.length && (
                    <>
                      <div className="section-heading">
                        <h2>Monthly budgets</h2>
                        <button
                          className="text-button"
                          onClick={() => setPage("Budgets")}
                        >
                          Manage budgets
                        </button>
                      </div>
                      <BudgetCards data={data} />
                    </>
                  )}
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Recent activity</h2>
                        <p>Your latest entries in {period}.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter(monthFilter(period));
                          setPage("Transactions");
                        }}
                      >
                        View transactions <ChevronRight size={15} />
                      </button>
                    </div>
                    {data.transactions.length ? (
                      <TransactionTable
                        rows={data.transactions.slice(0, 6)}
                        data={data}
                        edit={edit}
                        duplicate={duplicate}
                        remove={remove}
                      />
                    ) : (
                      <div className="empty-state">
                        <ReceiptText size={27} />
                        <h3>No transactions this month</h3>
                        <p>
                          Record income, an expense, or a transfer to start your
                          history.
                        </p>
                        <button
                          className="text-button"
                          disabled={!activeAccounts.length}
                          onClick={addTransaction}
                        >
                          Add your first transaction
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {page === "Accounts" && (
                <>
                  <p className="scope-note">
                    All balances include every recorded date. Archived balances
                    remain part of total tracked funds.
                  </p>
                  <section className="accounts-grid">
                    {data.accounts.map((a) => (
                      <article className="panel account-card" key={a.id}>
                        <span className="account-icon">
                          <Wallet size={23} />
                        </span>
                        <span className="account-type">
                          {a.accountType}
                          {a.isArchived ? " · archived" : ""}
                        </span>
                        <h2>{a.name}</h2>
                        <strong className="account-balance">
                          {money(a.balanceMinor)}
                        </strong>
                        <p>
                          Opening balance {money(a.openingBalanceMinor)}
                          <br />
                          Tracking from{" "}
                          {displayDate(
                            a.openingBalanceDate,
                            data.preferences.dateFormat,
                          )}
                        </p>
                        <div className="row-actions">
                          <button
                            className="text-button"
                            disabled={pending}
                            onClick={() =>
                              open({ type: "account", original: a })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="text-button"
                            disabled={pending}
                            onClick={() => archiveAccount(a)}
                          >
                            {a.isArchived ? "Reactivate" : "Archive"}
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setFilter({
                                ...monthFilter(period),
                                accountId: a.id,
                              });
                              setPage("Transactions");
                            }}
                          >
                            View history
                          </button>
                        </div>
                      </article>
                    ))}
                  </section>
                </>
              )}
              {page === "Transactions" && (
                <History
                  data={data}
                  filter={filter}
                  setFilter={setFilter}
                  revision={revision}
                  edit={edit}
                  duplicate={duplicate}
                  remove={remove}
                  exportCsv={exportCsv}
                  busy={pending}
                />
              )}
              {page === "Budgets" &&
                (data.budgets.length ? (
                  <BudgetCards
                    data={data}
                    edit={(budget) =>
                      open({ type: "budget", original: budget })
                    }
                    remove={(budget) =>
                      open({
                        type: "confirm",
                        title: "Remove budget?",
                        message:
                          "Remove the limit for this category and month? Transactions and spending history will remain.",
                        action: () => api.deleteBudget(budget.id),
                      })
                    }
                  />
                ) : (
                  <section className="panel empty-state">
                    <h2>Give this month a plan.</h2>
                    <p>
                      Set a limit for an expense category. We’ll show what you
                      spent and what remains.
                    </p>
                    <button
                      className="primary"
                      disabled={!ready}
                      onClick={() => open({ type: "budget" })}
                    >
                      Set your first budget
                    </button>
                  </section>
                ))}
              {page === "Reports" && <Reports data={data} />}
              {page === "Settings" && (
                <SettingsPanel
                  data={data}
                  busy={pending}
                  save={(input) =>
                    void run(
                      () => api.savePreferences(input),
                      "Preferences saved.",
                      false,
                    )
                  }
                  addCategory={() => open({ type: "category" })}
                  editCategory={(category) =>
                    open({ type: "category", original: category })
                  }
                  archiveCategory={archiveCategory}
                  backup={() =>
                    void run(async () => {
                      const path = await api.backup();
                      setNotice(
                        path
                          ? `Verified unencrypted backup saved: ${path}`
                          : "Backup cancelled.",
                      );
                    }, "")
                  }
                  restore={() => void inspect()}
                />
              )}
            </>
          )}
          <footer>
            <span>FinTrack · Personal finance, at your pace.</span>
            <span>
              <LockKeyhole size={12} />
              Stored on your computer
            </span>
          </footer>
        </div>
      </main>
      {editor && (
        <Modal
          title={
            editor.type === "confirm"
              ? editor.title
              : editor.type === "restore"
                ? "Review backup before restoring"
                : `${editor.original?.id ? "Edit" : "Add"} ${editor.type === "transaction" ? "a transaction" : editor.type === "account" ? "an account" : editor.type === "category" ? "a category" : "a monthly budget"}`
          }
          pending={pending}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
        >
          {editor.type === "account" && (
            <AccountForm
              original={editor.original}
              pending={pending}
              error={formError}
              save={(input, confirmed) =>
                void run(
                  () =>
                    editor.original
                      ? api.updateAccount(editor.original.id, input, confirmed)
                      : api.createAccount(input),
                  editor.original
                    ? "Account updated."
                    : "Account created and saved on this computer.",
                )
              }
            />
          )}
          {editor.type === "transaction" && data && (
            <TransactionForm
              data={data}
              original={editor.original}
              pending={pending}
              error={formError}
              save={(input) =>
                void run(
                  () =>
                    editor.original?.id
                      ? api.updateTransaction(editor.original.id, input)
                      : api.createTransaction(input),
                  "Transaction saved. Your balances are updated.",
                )
              }
            />
          )}
          {editor.type === "category" && (
            <CategoryForm
              original={
                editor.original
                  ? {
                      name: editor.original.name,
                      kind: editor.original.kind,
                      color: editor.original.color ?? "#39815d",
                    }
                  : undefined
              }
              pending={pending}
              error={formError}
              save={(input) =>
                void run(
                  () => api.saveCategory(editor.original?.id ?? null, input),
                  "Category saved.",
                )
              }
            />
          )}
          {editor.type === "budget" && data && (
            <BudgetForm
              data={data}
              categoryId={editor.original?.categoryId}
              amount={editor.original?.limitMinor}
              pending={pending}
              error={formError}
              save={(category, amount) =>
                void run(
                  () => api.saveBudget(category, period, amount),
                  "Monthly budget saved.",
                )
              }
            />
          )}
          {editor.type === "confirm" && (
            <>
              <p>{editor.message}</p>
              {formError && (
                <p role="alert" className="error-box">
                  {formError}
                </p>
              )}
              <div className="dialog-footer">
                <button
                  className="secondary"
                  disabled={pending}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() => void run(editor.action, "Change saved.")}
                >
                  Confirm
                </button>
              </div>
            </>
          )}
          {editor.type === "restore" && (
            <>
              <p className="file-path">{editor.preview.source}</p>
              <div className="restore-summary">
                <p>
                  {editor.preview.accounts} accounts ·{" "}
                  {editor.preview.transactions} active transactions
                </p>
                <strong>
                  Total tracked funds: {money(editor.preview.totalMinor)}
                </strong>
              </div>
              <p>
                Restoring replaces your current accounts, transactions, budgets,
                categories and preferences. A safety backup of current data will
                be created first. The backup is unencrypted.
              </p>
              {formError && (
                <p className="error-box" role="alert">
                  {formError}
                </p>
              )}
              <div className="dialog-footer">
                <button
                  className="secondary"
                  disabled={pending}
                  onClick={() => setEditor(null)}
                >
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={pending}
                  onClick={() =>
                    void run(async () => {
                      const safety = await api.restore(editor.preview.token);
                      setUndo(null);
                      setNotice(
                        `Restore completed. Previous data safety copy: ${safety}`,
                      );
                    }, "")
                  }
                >
                  Replace data and restore
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
