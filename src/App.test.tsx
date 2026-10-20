import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import App from "./App";
import { api } from "./lib/api";
import type { Snapshot } from "./lib/types";
vi.mock("./lib/api", () => ({
  desktopAvailable: true,
  api: {
    snapshot: vi.fn(),
    createAccount: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    undoDelete: vi.fn(),
    dataInfo: vi.fn(),
    inspectBackup: vi.fn(),
    restore: vi.fn(),
    history: vi.fn(),
    savePreferences: vi.fn(),
  },
  errorMessage: (error: { message: string }) => error.message,
}));
const empty: Snapshot = {
  budgets: [],
  spending: [],
  preferences: {
    theme: "system",
    dateFormat: "iso",
    profileName: "",
    startPage: "Dashboard",
    compactEntry: false,
  },
  accounts: [],
  categories: [{ id: "food", name: "Food", kind: "expense" }],
  transactions: [],
  period: "2026-10",
  totalTrackedBalanceMinor: "0",
  incomeMinor: "0",
  expenseMinor: "0",
  netCashFlowMinor: "0",
  transactionCount: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.snapshot).mockResolvedValue(empty);
  vi.mocked(api.dataInfo).mockResolvedValue({
    path: "C:\\fictional\\fintrack.sqlite",
    lastBackup: null,
  });
});

test("first account sends decimal text and refreshes persisted workspace", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Create your first account" }),
  );
  await user.type(screen.getByLabelText("Account name"), "Cash");
  await user.clear(screen.getByLabelText("Opening balance (LKR)"));
  await user.type(screen.getByLabelText("Opening balance (LKR)"), "1250.50");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() =>
    expect(api.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Cash",
        openingBalanceText: "1250.50",
        accountType: "cash",
      }),
    ),
  );
  await screen.findByText("Account created and saved on this computer.");
  expect(api.snapshot).toHaveBeenCalledTimes(2);
});

test("Rust validation errors stay in the form and allow correction", async () => {
  vi.mocked(api.snapshot).mockResolvedValue({
    ...empty,
    accounts: [
      {
        id: "cash",
        name: "Cash",
        accountType: "cash",
        openingBalanceDate: "2026-10-01",
        openingBalanceMinor: "0",
        balanceMinor: "0",
        isArchived: false,
      },
    ],
  });
  vi.mocked(api.createTransaction).mockRejectedValue({
    message: "Transaction amounts must be greater than zero.",
  });
  const user = userEvent.setup();
  render(<App />);
  const add = await screen.findByRole("button", {
    name: "Add transaction",
  });
  await waitFor(() => expect(add).toBeEnabled());
  await user.click(add);
  await user.type(screen.getByLabelText("Amount (LKR)"), "0");
  await user.click(screen.getByRole("button", { name: "Save transaction" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Transaction amounts must be greater than zero.",
  );
  expect(
    screen.getByRole("button", { name: "Save transaction" }),
  ).toBeEnabled();
});

test("a pending save cannot be submitted twice", async () => {
  let resolveSave!: () => void;
  vi.mocked(api.createAccount).mockReturnValue(
    new Promise<void>((resolve) => {
      resolveSave = resolve;
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: "Create your first account" }),
  );
  await user.type(screen.getByLabelText("Account name"), "Bank");
  await user.dblClick(screen.getByRole("button", { name: "Create account" }));
  expect(api.createAccount).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  resolveSave();
  await screen.findByText("Account created and saved on this computer.");
});

const populated: Snapshot = {
  ...empty,
  accounts: [
    {
      id: "cash",
      name: "Cash",
      accountType: "cash",
      openingBalanceDate: "2026-10-01",
      openingBalanceMinor: "10000",
      balanceMinor: "9500",
      isArchived: false,
    },
  ],
  transactions: [
    {
      id: "entry",
      kind: "expense",
      accountId: "cash",
      transferAccountId: null,
      categoryId: "food",
      amountMinor: "500",
      transactionDate: "2026-10-20",
      payee: "Fictional meal",
      note: "",
    },
  ],
  transactionCount: 1,
};

test("editing a transaction preserves its ID and sends exact decimal text", async () => {
  vi.mocked(api.snapshot).mockResolvedValue(populated);
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  await user.clear(screen.getByLabelText("Amount (LKR)"));
  await user.type(screen.getByLabelText("Amount (LKR)"), "7.25");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(api.updateTransaction).toHaveBeenCalledWith(
      "entry",
      expect.objectContaining({ amountText: "7.25", accountId: "cash" }),
    ),
  );
});
test("deletion requires confirmation and exposes a working undo action", async () => {
  vi.mocked(api.snapshot).mockResolvedValue(populated);
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Delete" }));
  expect(api.deleteTransaction).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await user.click(
    await screen.findByRole("button", { name: "Undo deletion" }),
  );
  await waitFor(() => expect(api.undoDelete).toHaveBeenCalledWith("entry"));
});
test("restore shows verified file contents before replacing records", async () => {
  vi.mocked(api.snapshot).mockResolvedValue(empty);
  vi.mocked(api.inspectBackup).mockResolvedValue({
    token: "verified-token",
    source: "Fictional backup.sqlite",
    accounts: 2,
    transactions: 15,
    totalMinor: "12345",
  });
  vi.mocked(api.restore).mockResolvedValue("Fictional safety.sqlite");
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Create your first account" });
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    await screen.findByRole("button", { name: "Inspect & restore backup" }),
  );
  await screen.findByText("2 accounts · 15 active transactions");
  expect(api.restore).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Replace data and restore" }),
  );
  await waitFor(() =>
    expect(api.restore).toHaveBeenCalledWith("verified-token"),
  );
  await screen.findByText(/Restore completed/);
});
