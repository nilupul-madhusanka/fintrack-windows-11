import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { displayDate, money } from "../lib/money";
import type {
  Snapshot,
  HistoryFilter,
  HistoryPage,
  Transaction,
} from "../lib/types";

export function TransactionTable({
  rows,
  data,
  edit,
  duplicate,
  remove,
}: {
  rows: Transaction[];
  data: Snapshot;
  edit: (row: Transaction) => void;
  duplicate: (row: Transaction) => void;
  remove: (row: Transaction) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Account</th>
            <th>Date</th>
            <th className="align-right">Amount</th>
            <th>Actions</th>
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
                      {row.payee ||
                        data.categories.find((c) => c.id === row.categoryId)
                          ?.name ||
                        "Transfer"}
                    </strong>
                    <small>
                      {row.kind} ·{" "}
                      {data.categories.find((c) => c.id === row.categoryId)
                        ?.name || "Between accounts"}
                      {row.note ? ` · ${row.note}` : ""}
                    </small>
                  </div>
                </div>
              </td>
              <td>
                {data.accounts.find((a) => a.id === row.accountId)?.name}
                {row.transferAccountId &&
                  ` → ${data.accounts.find((a) => a.id === row.transferAccountId)?.name}`}
              </td>
              <td className="date-cell">
                {displayDate(
                  row.transactionDate,
                  data.preferences?.dateFormat ?? "iso",
                )}
              </td>
              <td className={`align-right amount ${row.kind}`}>
                {row.kind === "expense"
                  ? "−"
                  : row.kind === "income"
                    ? "+"
                    : ""}
                {money(row.amountMinor)}
              </td>
              <td>
                <div className="row-actions">
                  <button className="text-button" onClick={() => edit(row)}>
                    Edit
                  </button>
                  <button
                    className="text-button"
                    onClick={() => duplicate(row)}
                  >
                    Duplicate
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => remove(row)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function History({
  data,
  filter,
  setFilter,
  revision,
  edit,
  duplicate,
  remove,
  exportCsv,
  busy,
}: {
  data: Snapshot;
  filter: HistoryFilter;
  setFilter: (filter: HistoryFilter) => void;
  revision: number;
  edit: (row: Transaction) => void;
  duplicate: (row: Transaction) => void;
  remove: (row: Transaction) => void;
  exportCsv: () => void;
  busy: boolean;
}) {
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    setPage(null);
    setError("");
    const timer = setTimeout(() => {
      api
        .history(filter)
        .then((result) => {
          if (id === request.current) {
            if (result.total > 0 && filter.offset >= result.total)
              setFilter({
                ...filter,
                offset: Math.floor((result.total - 1) / 100) * 100,
              });
            else setPage(result);
          }
        })
        .catch((cause) => {
          if (id === request.current) setError(errorMessage(cause));
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [filter, revision]);
  const change = (field: keyof HistoryFilter, value: string) =>
    setFilter({ ...filter, [field]: value, offset: 0 });
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Transaction history</h2>
          <p>
            {filter.start} through {filter.end} · {page?.total ?? "…"} matching
            records
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || !page}
          onClick={exportCsv}
        >
          Export these filters to CSV
        </button>
      </div>
      <div className="filters">
        <label>
          From
          <input
            type="date"
            required
            value={filter.start}
            onChange={(e) => change("start", e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            required
            value={filter.end}
            onChange={(e) => change("end", e.target.value)}
          />
        </label>
        <label>
          Kind
          <select
            value={filter.kind}
            onChange={(e) => change("kind", e.target.value)}
          >
            <option value="">All kinds</option>
            {["income", "expense", "transfer"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Account
          <select
            value={filter.accountId}
            onChange={(e) => change("accountId", e.target.value)}
          >
            <option value="">All accounts</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.isArchived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            value={filter.categoryId}
            onChange={(e) => change("categoryId", e.target.value)}
          >
            <option value="">All categories</option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.kind})
              </option>
            ))}
          </select>
        </label>
        <label className="search-filter">
          Search payee or notes
          <input
            type="search"
            maxLength={200}
            value={filter.search}
            onChange={(e) => change("search", e.target.value)}
            placeholder="Search records…"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="error-box">
          {error}
        </p>
      ) : !page ? (
        <p className="status-box" role="status">
          Loading history…
        </p>
      ) : page.rows.length ? (
        <TransactionTable
          rows={page.rows}
          data={data}
          edit={edit}
          duplicate={duplicate}
          remove={remove}
        />
      ) : (
        <div className="empty-state">
          <h3>No matching records</h3>
          <p>Adjust your filters or add a transaction.</p>
        </div>
      )}
      <div className="pagination">
        <button
          className="secondary"
          disabled={!page || filter.offset === 0}
          onClick={() =>
            setFilter({ ...filter, offset: Math.max(0, filter.offset - 100) })
          }
        >
          Previous
        </button>
        <span>
          {page?.total
            ? `${filter.offset + 1}–${Math.min(filter.offset + 100, page.total)} of ${page.total}`
            : "0 records"}
        </span>
        <button
          className="secondary"
          disabled={!page || filter.offset + 100 >= page.total}
          onClick={() => setFilter({ ...filter, offset: filter.offset + 100 })}
        >
          Next
        </button>
      </div>
    </section>
  );
}
