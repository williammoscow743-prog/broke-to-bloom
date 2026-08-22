import { fmt, isoDate } from "./finance";
import { RECURRENCES } from "./bills";

export { RECURRENCES };

export const INCOME_CATEGORIES = [
  "Employment",
  "Freelance",
  "Business",
  "Investment",
  "Rental",
  "Grant",
  "Refund",
  "Gift",
  "Other",
];

export const INCOME_STATUSES = ["expected", "received", "cancelled", "overdue"] as const;
export type IncomeStatus = (typeof INCOME_STATUSES)[number];

export type UpcomingIncome = {
  id: string;
  name: string;
  amount: number;
  expected_date: string;
  category: string | null;
  source: string | null;
  account_id: string | null;
  recurrence: string;
  status: string;
  notes: string | null;
  received_at: string | null;
  entry_id: string | null;
  archived_at: string | null;
};

export const INCOME_SELECT =
  "id,name,amount,expected_date,category,source,account_id,recurrence,status,notes,received_at,entry_id,archived_at";

export function normaliseIncome(row: Record<string, unknown>): UpcomingIncome {
  return {
    ...(row as unknown as UpcomingIncome),
    amount: Number(row.amount ?? 0),
    recurrence: (row.recurrence as string) ?? "one-time",
    status: (row.status as string) ?? "expected",
  };
}

/** Status shown in the UI — stored status, but a past "expected" date reads as overdue. */
export function incomeStatus(inc: UpcomingIncome): IncomeStatus {
  if (inc.status === "received") return "received";
  if (inc.status === "cancelled") return "cancelled";
  const today = isoDate(new Date());
  if (inc.expected_date < today) return "overdue";
  return "expected";
}

export function incomeStatusTone(status: IncomeStatus) {
  switch (status) {
    case "received":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "overdue":
      return "bg-rose-500/10 text-rose-600 border-rose-500/30";
    case "cancelled":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-sky-500/10 text-sky-600 border-sky-500/30";
  }
}

export type IncomeStats = {
  expected: UpcomingIncome[];
  dueSoon: UpcomingIncome[];
  expectedThisMonth: UpcomingIncome[];
  receivedThisMonth: UpcomingIncome[];
  overdue: UpcomingIncome[];
  totalExpectedThisMonth: number;
  totalDueSoon: number;
  totalReceivedThisMonth: number;
  totalOverdue: number;
};

export function computeIncomeStats(list: UpcomingIncome[]): IncomeStats {
  const active = list.filter((i) => !i.archived_at);
  const monthKey = isoDate(new Date()).slice(0, 7);
  const expected: UpcomingIncome[] = [];
  const dueSoon: UpcomingIncome[] = [];
  const expectedThisMonth: UpcomingIncome[] = [];
  const receivedThisMonth: UpcomingIncome[] = [];
  const overdue: UpcomingIncome[] = [];

  for (const i of active) {
    const st = incomeStatus(i);
    if (st === "received") {
      if ((i.received_at ?? i.expected_date).slice(0, 7) === monthKey) receivedThisMonth.push(i);
      continue;
    }
    if (st === "cancelled") continue;
    if (st === "overdue") overdue.push(i);
    else expected.push(i);
    const d = daysUntilIncome(i.expected_date);
    if (d >= 0 && d <= 7) dueSoon.push(i);
    if (i.expected_date.slice(0, 7) === monthKey) expectedThisMonth.push(i);
  }

  const sum = (arr: UpcomingIncome[]) => arr.reduce((s, i) => s + i.amount, 0);
  const byDate = (a: UpcomingIncome, b: UpcomingIncome) => a.expected_date.localeCompare(b.expected_date);

  return {
    expected: expected.sort(byDate),
    dueSoon: dueSoon.sort(byDate),
    expectedThisMonth: expectedThisMonth.sort(byDate),
    receivedThisMonth: receivedThisMonth.sort(byDate),
    overdue: overdue.sort(byDate),
    totalExpectedThisMonth: sum(expectedThisMonth),
    totalDueSoon: sum(dueSoon),
    totalReceivedThisMonth: sum(receivedThisMonth),
    totalOverdue: sum(overdue),
  };
}

export function daysUntilIncome(dateIso: string) {
  const a = new Date(isoDate(new Date()) + "T00:00:00").getTime();
  const b = new Date(dateIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function nextExpectedDate(dateIso: string, recurrence: string): string | null {
  const d = new Date(dateIso + "T00:00:00");
  switch (recurrence) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return isoDate(d);
}

export function expectedLabel(date: string, status: IncomeStatus) {
  if (status === "received") return "received";
  if (status === "cancelled") return "cancelled";
  const d = daysUntilIncome(date);
  if (d === 0) return "expected today";
  if (d === 1) return "expected tomorrow";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} late`;
  return `in ${d} days`;
}

/**
 * Income-aware insight rows for the existing insights widget.
 * Forecast only — expected income never counts toward the actual balance.
 */
export function computeIncomeInsights(
  list: UpcomingIncome[],
  opts: { balance: number },
): { icon: "up" | "down" | "tip" | "warn"; text: string }[] {
  const active = list.filter((i) => !i.archived_at);
  const out: { icon: "up" | "down" | "tip" | "warn"; text: string }[] = [];
  if (active.length === 0) return out;
  const s = computeIncomeStats(active);

  if (s.totalExpectedThisMonth > 0)
    out.push({
      icon: "tip",
      text: `${fmt(s.totalExpectedThisMonth)} of income is expected this month across ${s.expectedThisMonth.length} entr${s.expectedThisMonth.length === 1 ? "y" : "ies"} (forecast only).`,
    });

  if (s.dueSoon.length > 0)
    out.push({
      icon: "up",
      text: `${fmt(s.totalDueSoon)} should land in the next 7 days from ${s.dueSoon.length} source${s.dueSoon.length === 1 ? "" : "s"}.`,
    });

  if (s.totalExpectedThisMonth > 0)
    out.push({
      icon: "up",
      text: `Projected balance if all expected income arrives: ${fmt(opts.balance + s.totalExpectedThisMonth)}.`,
    });

  if (s.overdue.length > 0)
    out.push({
      icon: "warn",
      text: `${s.overdue.length} expected payment${s.overdue.length === 1 ? "" : "s"} (${fmt(s.totalOverdue)}) is late — follow up before you plan around it.`,
    });

  return out;
}
