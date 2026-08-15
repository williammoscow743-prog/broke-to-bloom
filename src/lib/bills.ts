import { fmt, isoDate } from "./finance";

export const BILL_CATEGORIES = [
  "Utilities",
  "Rent",
  "Subscriptions",
  "Insurance",
  "Loans",
  "Transport",
  "Phone & Internet",
  "Education",
  "Other",
];

export const UTILITY_CATEGORIES = ["Utilities", "Phone & Internet"];
export const SUBSCRIPTION_CATEGORIES = ["Subscriptions"];

export const RECURRENCES = [
  { value: "one-time", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

export const REMINDERS = [
  { value: 0, label: "Same day" },
  { value: 1, label: "1 day before" },
  { value: 3, label: "3 days before" },
  { value: 7, label: "7 days before" },
];

export const BILL_STATUSES = ["upcoming", "paid", "overdue", "skipped"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export type Bill = {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  category: string | null;
  account_id: string | null;
  payment_method: string | null;
  merchant: string | null;
  recurrence: string;
  reminder_days: number;
  status: string;
  paid: boolean;
  paid_at: string | null;
  notes: string | null;
  archived_at: string | null;
};

export const BILL_SELECT =
  "id,name,amount,due_date,category,account_id,payment_method,merchant,recurrence,reminder_days,status,paid,paid_at,notes,archived_at";

export function normaliseBill(row: Record<string, unknown>): Bill {
  return {
    ...(row as unknown as Bill),
    amount: Number(row.amount ?? 0),
    reminder_days: Number(row.reminder_days ?? 3),
    recurrence: (row.recurrence as string) ?? "one-time",
  };
}

/** Status shown in the UI — stored status, but "upcoming" past due reads as overdue. */
export function effectiveStatus(bill: Bill): BillStatus {
  if (bill.status === "paid" || bill.paid) return "paid";
  if (bill.status === "skipped") return "skipped";
  const today = isoDate(new Date());
  if (bill.due_date < today) return "overdue";
  return "upcoming";
}

export function daysUntil(dateIso: string) {
  const a = new Date(isoDate(new Date()) + "T00:00:00").getTime();
  const b = new Date(dateIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function nextDueDate(dateIso: string, recurrence: string): string | null {
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

export function statusTone(status: BillStatus) {
  switch (status) {
    case "paid":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "overdue":
      return "bg-rose-500/10 text-rose-600 border-rose-500/30";
    case "skipped":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-amber-500/10 text-amber-600 border-amber-500/30";
  }
}

export function reminderLabel(days: number) {
  const preset = REMINDERS.find((r) => r.value === days);
  return preset ? preset.label : `${days} days before`;
}

export type BillStats = {
  upcoming: Bill[];
  dueThisWeek: Bill[];
  dueThisMonth: Bill[];
  overdue: Bill[];
  paidThisMonth: Bill[];
  dueNext7: Bill[];
  totalDueThisMonth: number;
  totalOverdue: number;
  totalPaidThisMonth: number;
  totalNext7: number;
};

export function computeBillStats(bills: Bill[]): BillStats {
  const active = bills.filter((b) => !b.archived_at);
  const today = new Date();
  const monthKey = isoDate(today).slice(0, 7);
  const upcoming: Bill[] = [];
  const overdue: Bill[] = [];
  const dueThisWeek: Bill[] = [];
  const dueThisMonth: Bill[] = [];
  const paidThisMonth: Bill[] = [];
  const dueNext7: Bill[] = [];

  for (const b of active) {
    const st = effectiveStatus(b);
    const dd = daysUntil(b.due_date);
    if (st === "paid") {
      if ((b.paid_at ?? b.due_date).slice(0, 7) === monthKey) paidThisMonth.push(b);
      continue;
    }
    if (st === "skipped") continue;
    if (st === "overdue") overdue.push(b);
    else upcoming.push(b);
    if (dd >= 0 && dd <= 7) {
      dueThisWeek.push(b);
      dueNext7.push(b);
    }
    if (b.due_date.slice(0, 7) === monthKey) dueThisMonth.push(b);
  }

  const sum = (arr: Bill[]) => arr.reduce((s, b) => s + b.amount, 0);
  const byDate = (a: Bill, b: Bill) => a.due_date.localeCompare(b.due_date);

  return {
    upcoming: upcoming.sort(byDate),
    dueThisWeek: dueThisWeek.sort(byDate),
    dueThisMonth: dueThisMonth.sort(byDate),
    overdue: overdue.sort(byDate),
    paidThisMonth: paidThisMonth.sort(byDate),
    dueNext7: dueNext7.sort(byDate),
    totalDueThisMonth: sum(dueThisMonth),
    totalOverdue: sum(overdue),
    totalPaidThisMonth: sum(paidThisMonth),
    totalNext7: sum(dueNext7),
  };
}

/** Bill-aware insights, appended to the AI insights widget. */
export function computeBillInsights(
  bills: Bill[],
  opts: { monthIncome: number; balance: number },
): { icon: "up" | "down" | "tip" | "warn"; text: string }[] {
  const s = computeBillStats(bills);
  const out: { icon: "up" | "down" | "tip" | "warn"; text: string }[] = [];
  if (bills.filter((b) => !b.archived_at).length === 0) return out;

  if (s.totalDueThisMonth > 0)
    out.push({ icon: "tip", text: `${fmt(s.totalDueThisMonth)} in bills is due this month across ${s.dueThisMonth.length} bill${s.dueThisMonth.length === 1 ? "" : "s"}.` });

  if (s.dueNext7.length > 0)
    out.push({ icon: "warn", text: `${s.dueNext7.length} bill${s.dueNext7.length === 1 ? "" : "s"} worth ${fmt(s.totalNext7)} falls due in the next 7 days.` });

  if (opts.monthIncome > 0 && s.totalDueThisMonth > 0) {
    const ratio = Math.round((s.totalDueThisMonth / opts.monthIncome) * 100);
    out.push({
      icon: ratio > 50 ? "warn" : "up",
      text: `Bill-to-income ratio is ${ratio}% — ${ratio > 50 ? "over half your income is committed; renegotiate or cut a subscription." : "comfortably below the 50% danger line."}`,
    });
  }

  const projected = opts.balance - s.totalDueThisMonth - s.totalOverdue;
  out.push({
    icon: projected >= 0 ? "up" : "warn",
    text: `Predicted balance after all outstanding bills: ${fmt(projected)}.`,
  });

  if (s.overdue.length > 0)
    out.push({ icon: "warn", text: `${s.overdue.length} overdue bill${s.overdue.length === 1 ? "" : "s"} (${fmt(s.totalOverdue)}) — settle these first to avoid penalties.` });

  return out;
}

/** 0–100 score for bill payment behaviour, used by the financial health score. */
export function billBehaviourScore(bills: Bill[]): { score: number; hint: string } {
  const active = bills.filter((b) => !b.archived_at);
  if (active.length === 0) return { score: 50, hint: "No bills tracked yet" };
  const s = computeBillStats(active);
  const paidOnTime = active.filter((b) => effectiveStatus(b) === "paid" && (!b.paid_at || b.paid_at.slice(0, 10) <= b.due_date)).length;
  const settled = active.filter((b) => effectiveStatus(b) === "paid").length;
  const base = settled > 0 ? (paidOnTime / settled) * 100 : 60;
  const penalty = Math.min(60, s.overdue.length * 20);
  const score = Math.max(0, Math.min(100, Math.round(base - penalty)));
  return {
    score,
    hint: s.overdue.length > 0 ? `${s.overdue.length} overdue bill${s.overdue.length === 1 ? "" : "s"}` : `${paidOnTime}/${settled || 0} bills paid on time`,
  };
}
