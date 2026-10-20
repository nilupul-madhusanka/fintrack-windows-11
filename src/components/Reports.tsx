import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { money } from "../lib/money";
import type { Budget, Snapshot } from "../lib/types";
export function percent(spent: string, limit: string): number {
  const denominator = BigInt(limit);
  return denominator > 0n
    ? Number((BigInt(spent) * 10000n) / denominator) / 100
    : 0;
}
export function SpendingBars({ data }: { data: Snapshot }) {
  const rows = [...(data.spending ?? [])].sort((a, b) =>
    BigInt(a.amountMinor) > BigInt(b.amountMinor) ? -1 : 1,
  );
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Where your money went</h2>
          <p>Expenses by category · {data.period}</p>
        </div>
      </div>
      {rows.length ? (
        <div className="bar-list">
          {rows.map((row) => {
            const category = data.categories.find(
              (c) => c.id === row.categoryId,
            );
            return (
              <div className="bar-row" key={row.categoryId}>
                <div>
                  <span>{category?.name}</span>
                  <strong>{money(row.amountMinor)}</strong>
                </div>
                <div className="meter">
                  <span
                    style={{
                      width: `${percent(row.amountMinor, data.expenseMinor)}%`,
                      background: category?.color ?? "#39815d",
                    }}
                  />
                </div>
                <small>
                  {percent(row.amountMinor, data.expenseMinor).toFixed(1)}% of
                  monthly expenses
                </small>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No expenses this month</h3>
          <p>Expense categories will appear after you record spending.</p>
        </div>
      )}
    </section>
  );
}
export function BudgetCards({
  data,
  edit,
  remove,
}: {
  data: Snapshot;
  edit?: (budget: Budget) => void;
  remove?: (budget: Budget) => void;
}) {
  return (
    <div className="budget-grid">
      {(data.budgets ?? []).map((budget) => {
        const ratio = percent(budget.spentMinor, budget.limitMinor);
        return (
          <article className="panel budget-card" key={budget.id}>
            <div className="panel-heading">
              <h2>
                {data.categories.find((c) => c.id === budget.categoryId)?.name}
              </h2>
              <span
                className={`budget-state ${ratio >= 100 ? "over" : ratio >= 80 ? "near" : ""}`}
              >
                {ratio >= 100
                  ? "Limit reached"
                  : ratio >= 80
                    ? "Approaching limit"
                    : "On track"}
              </span>
            </div>
            <div className="budget-detail">
              <strong>{money(budget.spentMinor)}</strong>
              <p>of {money(budget.limitMinor)} spent</p>
              <div className="meter">
                <span
                  style={{
                    width: `${Math.min(100, ratio)}%`,
                    background:
                      ratio >= 100
                        ? "#a85440"
                        : ratio >= 80
                          ? "#a07934"
                          : undefined,
                  }}
                />
              </div>
              <small>
                {ratio.toFixed(1)}% used · {money(budget.remainingMinor)}{" "}
                remaining
              </small>
              {edit && remove && (
                <div className="row-actions">
                  <button className="text-button" onClick={() => edit(budget)}>
                    Edit limit
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => remove(budget)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function Reports({ data }: { data: Snapshot }) {
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setPrevious(null);
    setError("");
    const [y, m] = data.period.split("-").map(Number);
    const period =
      m === 1
        ? `${String(y - 1).padStart(4, "0")}-12`
        : `${String(y).padStart(4, "0")}-${String(m - 1).padStart(2, "0")}`;
    api
      .snapshot(period)
      .then((result) => {
        if (live) setPrevious(result);
      })
      .catch((cause) => {
        if (live) setError(errorMessage(cause));
      });
    return () => {
      live = false;
    };
  }, [data]);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Monthly cash flow</h2>
            <p>
              Opening balances and transfers are excluded from income and
              expenses.
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="comparison-grid">
          {[previous, data].map((month, index) =>
            month ? (
              <article className="comparison-card" key={month.period}>
                <h3>
                  {month.period}
                  {index === 1 ? " · Selected month" : " · Previous month"}
                </h3>
                <p>
                  Income <strong>{money(month.incomeMinor)}</strong>
                </p>
                <div className="meter income">
                  <span
                    style={{
                      width: `${percent(month.incomeMinor, BigInt(month.incomeMinor) > BigInt(month.expenseMinor) ? month.incomeMinor : month.expenseMinor)}%`,
                    }}
                  />
                </div>
                <p>
                  Expenses <strong>{money(month.expenseMinor)}</strong>
                </p>
                <div className="meter expense">
                  <span
                    style={{
                      width: `${percent(month.expenseMinor, BigInt(month.incomeMinor) > BigInt(month.expenseMinor) ? month.incomeMinor : month.expenseMinor)}%`,
                    }}
                  />
                </div>
                <p>
                  Net cash flow <strong>{money(month.netCashFlowMinor)}</strong>
                </p>
              </article>
            ) : (
              <p key={index} className="status-box">
                Loading comparison…
              </p>
            ),
          )}
        </div>
      </section>
      <SpendingBars data={data} />
    </>
  );
}
