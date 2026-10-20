import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { api, desktopAvailable, errorMessage } from "./lib/api";
import { localDate, money } from "./lib/money";
import type {
  AccountInput,
  Snapshot,
  TransactionInput,
  TransactionKind,
} from "./lib/types";
import "./App.css";

type Page = "Dashboard" | "Transactions" | "Accounts" | "Settings";
const navigation = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Transactions", icon: ReceiptText },
  { name: "Accounts", icon: Wallet },
  { name: "Settings", icon: Settings },
] as const;
const today = localDate();
const emptyAccount = (): AccountInput => ({
  name: "",
  accountType: "cash",
  openingBalanceText: "0.00",
  openingBalanceDate: localDate(),
});

export default function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [period, setPeriod] = useState(today.slice(0, 7));
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"account" | "transaction" | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState("");
  const [account, setAccount] = useState<AccountInput>(emptyAccount);
  const [transaction, setTransaction] = useState<TransactionInput>({
    kind: "expense",
    accountId: "",
    transferAccountId: null,
    categoryId: null,
    amountText: "",
    transactionDate: today,
    payee: "",
    note: "",
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setData(null);
    if (!desktopAvailable) {
      setLoading(false);
      return;
    }
    try {
      const result = await api.snapshot(period);
      if (request === generation.current) setData(result);
    } catch (cause) {
      if (request === generation.current) setError(errorMessage(cause));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [period]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  function openAccount() {
    setAccount(emptyAccount());
    setFormError("");
    setModal("account");
  }
  function openTransaction() {
    setTransaction({
      kind: "expense",
      accountId: data?.accounts.find((a) => !a.isArchived)?.id ?? "",
      transferAccountId: null,
      categoryId:
        data?.categories.find((c) => c.kind === "expense")?.id ?? null,
      amountText: "",
      transactionDate: localDate(),
      payee: "",
      note: "",
    });
    setFormError("");
    setModal("transaction");
  }
  function changeKind(kind: TransactionKind) {
    setTransaction((current) => ({
      ...current,
      kind,
      transferAccountId: null,
      categoryId:
        kind === "transfer"
          ? null
          : (data?.categories.find((c) => c.kind === kind)?.id ?? null),
    }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setFormError("");
    try {
      if (modal === "account") await api.createAccount(account);
      else await api.createTransaction(transaction);
      setModal(null);
      setNotice(
        modal === "account"
          ? "Account created and saved on this computer."
          : "Transaction saved. Your balances are updated.",
      );
      await refresh();
    } catch (cause) {
      setFormError(errorMessage(cause));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const activeAccounts = data?.accounts.filter((a) => !a.isArchived) ?? [];
  const categoryName = (id: string | null) =>
    data?.categories.find((c) => c.id === id)?.name ?? "Transfer";
  const accountName = (id: string | null) =>
    data?.accounts.find((a) => a.id === id)?.name ?? "";
  const ready = desktopAvailable && !!data && !loading && !error;
  function history(compact = false) {
    const rows = compact ? data?.transactions.slice(0, 6) : data?.transactions;
    return rows?.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Account</th>
              <th>Date</th>
              <th className="align-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="transaction-cell">
                    <span className={`transaction-icon ${row.kind}`}>
                      {row.kind === "income" ? (
                        <ArrowDownLeft size={17} />
                      ) : row.kind === "expense" ? (
                        <ArrowUpRight size={17} />
                      ) : (
                        <ArrowLeftRight size={17} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {row.payee || categoryName(row.categoryId)}
                      </strong>
                      <small>
                        {row.kind} · {categoryName(row.categoryId)}
                        {row.note ? ` · ${row.note}` : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {accountName(row.accountId)}
                  {row.transferAccountId &&
                    ` → ${accountName(row.transferAccountId)}`}
                </td>
                <td className="date-cell">{row.transactionDate}</td>
                <td className={`align-right amount ${row.kind}`}>
                  {row.kind === "expense"
                    ? "−"
                    : row.kind === "income"
                      ? "+"
                      : ""}
                  {money(row.amountMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty-state">
        <ReceiptText size={27} />
        <h3>No transactions this month</h3>
        <p>Record income, an expense, or a transfer to start your history.</p>
        <button
          className="text-button"
          disabled={!ready || !activeAccounts.length}
          onClick={openTransaction}
        >
          Add your first transaction <ChevronRight size={16} />
        </button>
      </div>
    );
  }
  return (
    <div className="app-shell">
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
              className={page === name ? "nav-item active" : "nav-item"}
              onClick={() => setPage(name)}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} />
              {name}
              {page === name && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="coming-next">
          <span className="nav-label">COMING NEXT</span>
          <p>
            Monthly budgets
            <br />
            Reports & backup
          </p>
          <span className="version-tag">Foundation · v0.1.0</span>
        </div>
        <div className="local-card">
          <ShieldCheck size={22} />
          <strong>Yours. Always.</strong>
          <p>Your records stay on this computer. No cloud account needed.</p>
          <span>
            <i /> Offline by design
          </span>
        </div>
        <div className="profile">
          <span className="avatar">F</span>
          <div>
            <strong>Personal workspace</strong>
            <small>English · LKR</small>
          </div>
          <LockKeyhole size={15} />
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Personal finance <ChevronRight size={14} /> <strong>{page}</strong>
          </span>
          <span className="local-badge">
            <i /> Local workspace
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
                  : page === "Accounts"
                    ? "Every balance starts with a reliable account."
                    : page === "Transactions"
                      ? "The details behind your day-to-day finances."
                      : "A private workspace, built around you."}
              </p>
            </div>
            <div className="heading-actions">
              {(page === "Dashboard" || page === "Transactions") && (
                <label className="month-label">
                  <span className="sr-only">Report month</span>
                  <input
                    aria-label="Report month"
                    type="month"
                    value={period}
                    min="0001-01"
                    max="9998-12"
                    required
                    disabled={loading || pending}
                    onChange={(e) => {
                      if (/^\d{4}-\d{2}$/.test(e.target.value))
                        setPeriod(e.target.value);
                    }}
                  />
                </label>
              )}
              {page !== "Settings" && (
                <button
                  className="primary"
                  disabled={!ready}
                  onClick={
                    page === "Accounts" || !activeAccounts.length
                      ? openAccount
                      : openTransaction
                  }
                >
                  <Plus size={17} />
                  {page === "Accounts" || !activeAccounts.length
                    ? "Add account"
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
                  This browser view shows the interface. Launch the Windows
                  application to create accounts and save records in the local
                  database.
                </p>
              </div>
            </div>
          )}
          {loading && (
            <p role="status" className="status-box">
              Opening your local workspace…
            </p>
          )}
          {error && (
            <div role="alert" className="error-box">
              {error}
              <button className="text-button" onClick={() => void refresh()}>
                Try again
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
          {ready && !data.accounts.length && page !== "Settings" && (
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
                <button className="primary" onClick={openAccount}>
                  <Plus size={17} />
                  Create your first account
                </button>
              </div>
              <span className="welcome-decoration" aria-hidden="true">
                ↗
              </span>
            </section>
          )}
          {page === "Dashboard" && (
            <>
              <section className="stats-grid" aria-label="Financial summary">
                {[
                  {
                    label: "Total tracked balance",
                    value: data?.totalTrackedBalanceMinor,
                    icon: Wallet,
                    detail: "All accounts · all recorded dates",
                    style: "balance",
                  },
                  {
                    label: "Monthly income",
                    value: data?.incomeMinor,
                    icon: ArrowDownLeft,
                    detail: "Money received this month",
                    style: "income",
                  },
                  {
                    label: "Monthly expenses",
                    value: data?.expenseMinor,
                    icon: ArrowUpRight,
                    detail: "Money spent this month",
                    style: "expense",
                  },
                  {
                    label: "Net cash flow",
                    value: data?.netCashFlowMinor,
                    icon: ArrowLeftRight,
                    detail: "Income minus expenses",
                    style: "net",
                  },
                ].map(({ label, value, icon: Icon, detail, style }) => (
                  <article key={label} className={`stat-card ${style}`}>
                    <div className="stat-title">
                      {label}
                      <Icon size={18} />
                    </div>
                    <strong className="stat-value">
                      {value !== undefined && !loading && !error
                        ? money(value)
                        : "—"}
                    </strong>
                    <small>{detail}</small>
                  </article>
                ))}
              </section>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Your accounts</h2>
                      <p>A place for every rupee.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("Accounts")}
                    >
                      Manage <ChevronRight size={15} />
                    </button>
                  </div>
                  {data?.accounts.length ? (
                    data.accounts.map((a) => (
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
                    ))
                  ) : (
                    <div className="quiet-empty">
                      <Wallet size={25} />
                      <p>Your accounts will appear here.</p>
                    </div>
                  )}
                  <button
                    className="add-account-line"
                    disabled={!ready}
                    onClick={openAccount}
                  >
                    <Plus size={16} /> Add an account
                  </button>
                </section>
                <section className="insight-card">
                  <span className="insight-icon">
                    <LockKeyhole size={23} />
                  </span>
                  <span className="eyebrow">LESS NOISE. MORE CONTROL.</span>
                  <h2>
                    A small habit.
                    <br />A clearer tomorrow.
                  </h2>
                  <p>
                    Log the little things. Keep transfers separate from
                    spending. See your money with confidence.
                  </p>
                  <div className="insight-footer">
                    <ShieldCheck size={16} /> No sign-ups. No automatic uploads.
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent activity</h2>
                    <p>Your latest entries in the selected month.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setPage("Transactions")}
                  >
                    View transactions <ChevronRight size={15} />
                  </button>
                </div>
                {history(true)}
              </section>
            </>
          )}
          {page === "Accounts" && (
            <section className="accounts-grid">
              {data?.accounts.map((a) => (
                <article className="panel account-card" key={a.id}>
                  <span className="account-icon">
                    <Wallet size={23} />
                  </span>
                  <span className="account-type">{a.accountType}</span>
                  <h2>{a.name}</h2>
                  <strong className="account-balance">
                    {money(a.balanceMinor)}
                  </strong>
                  <p>
                    Opening balance {money(a.openingBalanceMinor)}
                    <br />
                    Tracking from {a.openingBalanceDate}
                  </p>
                  <small>All recorded dates included</small>
                </article>
              ))}
            </section>
          )}
          {page === "Transactions" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Transaction history</h2>
                  <p>
                    Latest 100 entries in {period}.{" "}
                    {data?.transactionCount ?? 0} total this month.
                  </p>
                </div>
                <span className="version-tag">Income · Expense · Transfer</span>
              </div>
              {history()}
            </section>
          )}
          {page === "Settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <Database size={25} />
                <h2>Your data belongs to you.</h2>
                <p>
                  Records are saved to a local SQLite database in your Windows
                  app data folder. FinTrack does not automatically upload your
                  records or require a cloud account.
                </p>
                <p>
                  Local storage is currently unencrypted. Anyone with access to
                  your Windows account or storage device may be able to read it.
                </p>
                <div className="setting-row">
                  <span>Currency</span>
                  <strong>Sri Lankan rupee (LKR)</strong>
                </div>
                <div className="setting-row">
                  <span>Language</span>
                  <strong>English</strong>
                </div>
                <div className="setting-row">
                  <span>Version</span>
                  <strong>0.1.0 · Foundation</strong>
                </div>
              </section>
              <section className="panel settings-card">
                <h2>Starter categories</h2>
                <p>
                  Income and expense categories stay separate for accurate
                  records.
                </p>
                {(["expense", "income"] as const).map((kind) => (
                  <div className="category-group" key={kind}>
                    <h3>{kind}</h3>
                    <div className="chips">
                      {data?.categories
                        .filter((c) => c.kind === kind)
                        .map((c) => (
                          <span key={c.id}>{c.name}</span>
                        ))}
                    </div>
                  </div>
                ))}
                <p className="development-note">
                  Next milestones: category management, budgets, CSV export, and
                  verified backup/restore. Keep separate copies of important
                  records during development.
                </p>
              </section>
            </div>
          )}
          <footer>
            <span>FinTrack · Personal finance, at your pace.</span>
            <span>
              <LockKeyhole size={12} /> Stored on your computer
            </span>
          </footer>
        </div>
      </main>
      <dialog
        ref={dialog}
        onCancel={(event) => {
          if (saving.current) event.preventDefault();
          else setModal(null);
        }}
        onClose={() => {
          if (!saving.current) setModal(null);
        }}
      >
        <form onSubmit={save}>
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
              <h2>
                {modal === "account" ? "Add an account" : "Add a transaction"}
              </h2>
            </div>
            <button
              type="button"
              className="icon-button"
              disabled={pending}
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={22} />
            </button>
          </div>
          <fieldset disabled={pending}>
            {modal === "account" ? (
              <>
                <label>
                  Account name
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={account.name}
                    placeholder="e.g. Cash wallet"
                    onChange={(e) =>
                      setAccount({ ...account, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Account type
                  <select
                    value={account.accountType}
                    onChange={(e) =>
                      setAccount({ ...account, accountType: e.target.value })
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="ewallet">E-wallet</option>
                    <option value="other">Other cash-like account</option>
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Opening balance (LKR)
                    <input
                      inputMode="decimal"
                      required
                      maxLength={18}
                      value={account.openingBalanceText}
                      onChange={(e) =>
                        setAccount({
                          ...account,
                          openingBalanceText: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Tracking start date
                    <input
                      type="date"
                      required
                      min="0001-01-01"
                      max="9998-12-31"
                      value={account.openingBalanceDate}
                      onChange={(e) =>
                        setAccount({
                          ...account,
                          openingBalanceDate: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <p className="form-hint">
                  The balance you already have when tracking starts. This is not
                  counted as income.
                </p>
              </>
            ) : (
              <>
                <div
                  className="kind-tabs"
                  role="group"
                  aria-label="Transaction kind"
                >
                  {(["expense", "income", "transfer"] as const).map((kind) => (
                    <button
                      type="button"
                      key={kind}
                      aria-pressed={transaction.kind === kind}
                      className={transaction.kind === kind ? "selected" : ""}
                      onClick={() => changeKind(kind)}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  <label>
                    Amount (LKR)
                    <input
                      autoFocus
                      required
                      inputMode="decimal"
                      maxLength={18}
                      placeholder="0.00"
                      value={transaction.amountText}
                      onChange={(e) =>
                        setTransaction({
                          ...transaction,
                          amountText: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      required
                      min="0001-01-01"
                      max="9998-12-31"
                      value={transaction.transactionDate}
                      onChange={(e) =>
                        setTransaction({
                          ...transaction,
                          transactionDate: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  {transaction.kind === "transfer" ? "From account" : "Account"}
                  <select
                    required
                    value={transaction.accountId}
                    onChange={(e) =>
                      setTransaction({
                        ...transaction,
                        accountId: e.target.value,
                        transferAccountId: null,
                      })
                    }
                  >
                    {activeAccounts.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                {transaction.kind === "transfer" ? (
                  <label>
                    To account
                    <select
                      required
                      value={transaction.transferAccountId ?? ""}
                      onChange={(e) =>
                        setTransaction({
                          ...transaction,
                          transferAccountId: e.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        Select destination
                      </option>
                      {activeAccounts
                        .filter((a) => a.id !== transaction.accountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <span className="form-hint">
                      Transfers change balances, not income or expenses.
                    </span>
                  </label>
                ) : (
                  <label>
                    Category
                    <select
                      required
                      value={transaction.categoryId ?? ""}
                      onChange={(e) =>
                        setTransaction({
                          ...transaction,
                          categoryId: e.target.value,
                        })
                      }
                    >
                      {data?.categories
                        .filter((c) => c.kind === transaction.kind)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label>
                  Payee or description{" "}
                  <span className="optional">optional</span>
                  <input
                    maxLength={120}
                    placeholder="e.g. Lunch"
                    value={transaction.payee}
                    onChange={(e) =>
                      setTransaction({ ...transaction, payee: e.target.value })
                    }
                  />
                </label>
                <label>
                  Note <span className="optional">optional</span>
                  <textarea
                    maxLength={1000}
                    rows={2}
                    value={transaction.note}
                    onChange={(e) =>
                      setTransaction({ ...transaction, note: e.target.value })
                    }
                  />
                </label>
              </>
            )}
          </fieldset>
          {formError && (
            <p className="error-box" role="alert">
              {formError}
            </p>
          )}
          <div className="dialog-footer">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button className="primary" disabled={pending}>
              {pending
                ? "Saving…"
                : modal === "account"
                  ? "Create account"
                  : "Save transaction"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
