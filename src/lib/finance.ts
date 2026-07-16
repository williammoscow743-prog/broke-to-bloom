export const SAVINGS_CATEGORY = "Savings";

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Bills",
  "Shopping",
  "Entertainment",
  "Health",
  "Other",
];
export const INCOME_CATEGORIES = ["Salary", "Freelance", "Business", "Gift", "Other"];

export const ACCOUNT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "savings", label: "Savings" },
  { value: "credit", label: "Credit" },
  { value: "business", label: "Business" },
  { value: "wallet", label: "Wallet" },
];

export const PAYMENT_METHODS = ["Cash", "Card", "EFT", "Debit Order", "Instant EFT", "Other"];

export const TRANSACTION_STATUSES = ["cleared", "pending", "scheduled"];

export function fmt(n: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
