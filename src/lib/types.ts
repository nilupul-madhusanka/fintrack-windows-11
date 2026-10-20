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
  color?: string | null;
  isArchived?: boolean;
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
  budgets: Budget[];
  spending: { categoryId: string; amountMinor: string }[];
  preferences: Preferences;
}

export interface Budget {
  id: string;
  categoryId: string;
  period: string;
  limitMinor: string;
  spentMinor: string;
  remainingMinor: string;
}
export interface Preferences {
  theme: "system" | "light" | "dark";
  dateFormat: "iso" | "day-first" | "month-first";
  profileName: string;
  startPage: string;
  compactEntry: boolean;
}
export interface HistoryFilter {
  start: string;
  end: string;
  kind: string;
  accountId: string;
  categoryId: string;
  search: string;
  offset: number;
}
export interface HistoryPage {
  rows: Transaction[];
  total: number;
}
export interface CategoryInput {
  name: string;
  kind: "income" | "expense";
  color: string;
}
export interface BackupPreview {
  token: string;
  source: string;
  accounts: number;
  transactions: number;
  totalMinor: string;
}
export interface DataInfo {
  path: string;
  lastBackup: string | null;
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
