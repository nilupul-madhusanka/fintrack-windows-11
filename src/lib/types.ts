export type TransactionKind = "income" | "expense" | "transfer";
export interface Account {
  id: string;
  name: string;
  accountType: string;
  openingBalanceMinor: string;
  openingBalanceDate: string;
  balanceMinor: string;
  isArchived: boolean;
}
export interface Category {
  id: string;
  name: string;
  kind: "income" | "expense";
}
export interface Transaction {
  id: string;
  kind: TransactionKind;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  amountMinor: string;
  transactionDate: string;
  payee: string;
  note: string;
}
export interface Snapshot {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  period: string;
  totalTrackedBalanceMinor: string;
  incomeMinor: string;
  expenseMinor: string;
  netCashFlowMinor: string;
  transactionCount: number;
}
export interface AccountInput {
  name: string;
  accountType: string;
  openingBalanceText: string;
  openingBalanceDate: string;
}
export interface TransactionInput {
  kind: TransactionKind;
  accountId: string;
  transferAccountId: string | null;
  categoryId: string | null;
  amountText: string;
  transactionDate: string;
  payee: string;
  note: string;
}
