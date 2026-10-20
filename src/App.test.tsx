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
  },
  errorMessage: (error: { message: string }) => error.message,
}));
const empty: Snapshot = {
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
