import { useState, type FormEvent, type ReactNode } from "react";
import type {
  Account,
  AccountInput,
  CategoryInput,
  Snapshot,
  Transaction,
  TransactionInput,
  TransactionKind,
} from "../lib/types";
import { decimal, localDate } from "../lib/money";

export function FormShell({
  pending,
  error,
  onSubmit,
  children,
  label,
}: {
  pending: boolean;
  error: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={pending}>{children}</fieldset>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-footer">
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </form>
  );
}
export function AccountForm({
  original,
  pending,
  error,
  save,
}: {
  original?: Account;
  pending: boolean;
  error: string;
  save: (input: AccountInput, confirmed: boolean) => void;
}) {
  const [input, set] = useState<AccountInput>({
    name: original?.name ?? "",
    accountType: original?.accountType ?? "cash",
    openingBalanceText: original
      ? decimal(original.openingBalanceMinor)
      : "0.00",
    openingBalanceDate: original?.openingBalanceDate ?? localDate(),
  });
  const [confirmed, confirm] = useState(false);
  const changed =
    !!original &&
    (input.openingBalanceText !== decimal(original.openingBalanceMinor) ||
      input.openingBalanceDate !== original.openingBalanceDate);
  return (
    <FormShell
      pending={pending}
      error={error}
      label={original ? "Save account" : "Create account"}
      onSubmit={(e) => {
        e.preventDefault();
        save(input, confirmed);
      }}
    >
      <label>
        Account name
        <input
          autoFocus
          required
          maxLength={80}
          value={input.name}
          placeholder="e.g. Cash wallet"
          onChange={(e) => set({ ...input, name: e.target.value })}
        />
      </label>
      <label>
        Account type
        <select
          value={input.accountType}
          onChange={(e) => set({ ...input, accountType: e.target.value })}
        >
          {[
            ["cash", "Cash"],
            ["bank", "Bank"],
            ["ewallet", "E-wallet"],
            ["other", "Other cash-like account"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Opening balance (LKR)
          <input
            required
            inputMode="decimal"
            maxLength={18}
            value={input.openingBalanceText}
            onChange={(e) =>
              set({ ...input, openingBalanceText: e.target.value })
            }
          />
        </label>
        <label>
          Tracking start date
          <input
            required
            type="date"
            min="0001-01-01"
            max="9998-12-31"
            value={input.openingBalanceDate}
            onChange={(e) =>
              set({ ...input, openingBalanceDate: e.target.value })
            }
          />
        </label>
      </div>
      <p className="form-hint">
        The balance you already have when tracking starts. This is not counted
        as income.
      </p>
      {changed && (
        <label className="checkbox-label">
          <input
            required
            type="checkbox"
            checked={confirmed}
            onChange={(e) => confirm(e.target.checked)}
          />
          I understand that changing the opening balance or start date changes
          historical balances.
        </label>
      )}
    </FormShell>
  );
}
export function TransactionForm({
  data,
  original,
  pending,
  error,
  save,
}: {
  data: Snapshot;
  original?: Transaction;
  pending: boolean;
  error: string;
  save: (input: TransactionInput) => void;
}) {
  const [input, set] = useState<TransactionInput>(
    original
      ? {
          kind: original.kind,
          accountId: original.accountId,
          transferAccountId: original.transferAccountId,
          categoryId: original.categoryId,
          amountText: decimal(original.amountMinor),
          transactionDate: original.transactionDate,
          payee: original.payee,
          note: original.note,
        }
      : {
          kind: "expense",
          accountId: data.accounts.find((a) => !a.isArchived)?.id ?? "",
          transferAccountId: null,
          categoryId:
            data.categories.find((c) => c.kind === "expense" && !c.isArchived)
              ?.id ?? null,
          amountText: "",
          transactionDate: localDate(),
          payee: "",
          note: "",
        },
  );
  const [details, showDetails] = useState(
    !data.preferences?.compactEntry || !!input.note,
  );
  function kind(kind: TransactionKind) {
    set({
      ...input,
      kind,
      categoryId:
        kind === "transfer"
          ? null
          : (data.categories.find((c) => c.kind === kind && !c.isArchived)
              ?.id ?? null),
      transferAccountId: null,
    });
  }
  return (
    <FormShell
      pending={pending}
      error={error}
      label={original?.id ? "Save changes" : "Save transaction"}
      onSubmit={(e) => {
        e.preventDefault();
        save(input);
      }}
    >
      <div className="kind-tabs" role="group" aria-label="Transaction kind">
        {(["expense", "income", "transfer"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={input.kind === value}
            className={input.kind === value ? "selected" : ""}
            onClick={() => kind(value)}
          >
            {value}
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
            value={input.amountText}
            onChange={(e) => set({ ...input, amountText: e.target.value })}
          />
        </label>
        <label>
          Date
          <input
            required
            type="date"
            min="0001-01-01"
            max="9998-12-31"
            value={input.transactionDate}
            onChange={(e) => set({ ...input, transactionDate: e.target.value })}
          />
        </label>
      </div>
      <label>
        {input.kind === "transfer" ? "From account" : "Account"}
        <select
          required
          value={input.accountId}
          onChange={(e) =>
            set({
              ...input,
              accountId: e.target.value,
              transferAccountId: null,
            })
          }
        >
          <option value="" disabled>
            Select an account
          </option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id} disabled={a.isArchived}>
              {a.name}
              {a.isArchived ? " (archived — reactivate to edit)" : ""}
            </option>
          ))}
        </select>
      </label>
      {input.kind === "transfer" ? (
        <label>
          To account
          <select
            required
            value={input.transferAccountId ?? ""}
            onChange={(e) =>
              set({ ...input, transferAccountId: e.target.value })
            }
          >
            <option value="" disabled>
              Select destination
            </option>
            {data.accounts
              .filter((a) => a.id !== input.accountId)
              .map((a) => (
                <option key={a.id} value={a.id} disabled={a.isArchived}>
                  {a.name}
                  {a.isArchived ? " (archived)" : ""}
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
            value={input.categoryId ?? ""}
            onChange={(e) => set({ ...input, categoryId: e.target.value })}
          >
            <option value="" disabled>
              Select a category
            </option>
            {data.categories
              .filter((c) => c.kind === input.kind)
              .map((c) => (
                <option key={c.id} value={c.id} disabled={c.isArchived}>
                  {c.name}
                  {c.isArchived ? " (archived — reactivate to edit)" : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        Payee or description <span className="optional">optional</span>
        <input
          maxLength={120}
          placeholder="e.g. Lunch"
          value={input.payee}
          onChange={(e) => set({ ...input, payee: e.target.value })}
        />
      </label>
      {details ? (
        <label>
          Note <span className="optional">optional</span>
          <textarea
            rows={2}
            maxLength={1000}
            value={input.note}
            onChange={(e) => set({ ...input, note: e.target.value })}
          />
        </label>
      ) : (
        <button
          type="button"
          className="text-button"
          onClick={() => showDetails(true)}
        >
          Add a note
        </button>
      )}
    </FormShell>
  );
}
export function CategoryForm({
  original,
  pending,
  error,
  save,
}: {
  original?: CategoryInput;
  pending: boolean;
  error: string;
  save: (input: CategoryInput) => void;
}) {
  const [input, set] = useState<CategoryInput>(
    original ?? { name: "", kind: "expense", color: "#39815d" },
  );
  return (
    <FormShell
      pending={pending}
      error={error}
      label="Save category"
      onSubmit={(e) => {
        e.preventDefault();
        save(input);
      }}
    >
      <label>
        Category name
        <input
          autoFocus
          required
          maxLength={80}
          value={input.name}
          onChange={(e) => set({ ...input, name: e.target.value })}
        />
      </label>
      <label>
        Kind
        <select
          disabled={!!original}
          value={input.kind}
          onChange={(e) =>
            set({ ...input, kind: e.target.value as "income" | "expense" })
          }
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </label>
      <label>
        Color
        <input
          type="color"
          value={input.color}
          onChange={(e) => set({ ...input, color: e.target.value })}
        />
      </label>
      <p className="form-hint">
        Category kind stays fixed so historical reports remain consistent.
      </p>
    </FormShell>
  );
}
export function BudgetForm({
  data,
  categoryId,
  amount,
  pending,
  error,
  save,
}: {
  data: Snapshot;
  categoryId?: string;
  amount?: string;
  pending: boolean;
  error: string;
  save: (categoryId: string, amount: string) => void;
}) {
  const [category, setCategory] = useState(
    categoryId ??
      data.categories.find((c) => c.kind === "expense" && !c.isArchived)?.id ??
      "",
  );
  const [limit, setLimit] = useState(amount ? decimal(amount) : "");
  return (
    <FormShell
      pending={pending}
      error={error}
      label="Save budget"
      onSubmit={(e) => {
        e.preventDefault();
        save(category, limit);
      }}
    >
      <label>
        Expense category
        <select
          disabled={!!categoryId}
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="" disabled>
            Select category
          </option>
          {data.categories
            .filter((c) => c.kind === "expense")
            .map((c) => (
              <option key={c.id} value={c.id} disabled={c.isArchived}>
                {c.name}
                {c.isArchived ? " (archived)" : ""}
              </option>
            ))}
        </select>
      </label>
      <label>
        Monthly limit (LKR)
        <input
          autoFocus
          required
          inputMode="decimal"
          maxLength={18}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <p className="form-hint">
        For {data.period}. Saving replaces this category’s limit for the month.
        Genuine expenses can still be recorded when over budget.
      </p>
    </FormShell>
  );
}
