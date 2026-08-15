import { supabase } from "@/integrations/supabase/client";
import { fmt, isoDate } from "./finance";
import { computeBillStats, daysUntil, type Bill } from "./bills";

type Pending = {
  kind: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "success";
  billId: string;
};

/**
 * Creates bill reminder notifications (upcoming, due tomorrow, overdue, recurring).
 * Safe to call repeatedly — it skips notifications already created today for a bill.
 */
export async function syncBillNotifications(userId: string, bills: Bill[]) {
  const active = bills.filter((b) => !b.archived_at);
  if (active.length === 0) return 0;

  const stats = computeBillStats(active);
  const pending: Pending[] = [];

  for (const b of stats.upcoming) {
    const d = daysUntil(b.due_date);
    if (d === 1) {
      pending.push({
        kind: "bill_due_tomorrow",
        title: `${b.name} is due tomorrow`,
        body: `${fmt(b.amount)} due on ${b.due_date}.`,
        severity: "warning",
        billId: b.id,
      });
    } else if (d >= 0 && d <= b.reminder_days) {
      pending.push({
        kind: "bill_upcoming",
        title: `Upcoming bill: ${b.name}`,
        body: `${fmt(b.amount)} due in ${d} day${d === 1 ? "" : "s"} (${b.due_date}).`,
        severity: "info",
        billId: b.id,
      });
    }
    if (b.recurrence !== "one-time" && d >= 0 && d <= 2) {
      pending.push({
        kind: "bill_recurring",
        title: `${b.name} recurs ${b.recurrence}`,
        body: `Next ${b.recurrence} charge of ${fmt(b.amount)} on ${b.due_date}.`,
        severity: "info",
        billId: b.id,
      });
    }
  }

  for (const b of stats.overdue) {
    pending.push({
      kind: "bill_overdue",
      title: `Overdue: ${b.name}`,
      body: `${fmt(b.amount)} was due on ${b.due_date}.`,
      severity: "warning",
      billId: b.id,
    });
  }

  if (pending.length === 0) return 0;

  const since = isoDate(new Date()) + "T00:00:00.000Z";
  const { data: existing } = await supabase
    .from("notifications")
    .select("kind,metadata")
    .gte("created_at", since)
    .like("kind", "bill%");

  const seen = new Set(
    (existing ?? []).map((n) => `${n.kind}:${(n.metadata as { bill_id?: string } | null)?.bill_id ?? ""}`),
  );

  const rows = pending
    .filter((p) => !seen.has(`${p.kind}:${p.billId}`))
    .map((p) => ({
      user_id: userId,
      kind: p.kind,
      title: p.title,
      body: p.body,
      severity: p.severity,
      link: "/bills",
      metadata: { bill_id: p.billId },
    }));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) return 0;
  return rows.length;
}

export async function notifyBillPaid(userId: string, bill: Bill) {
  await supabase.from("notifications").insert({
    user_id: userId,
    kind: "bill_paid",
    title: `${bill.name} marked as paid`,
    body: `${fmt(bill.amount)} settled${bill.due_date ? ` (due ${bill.due_date})` : ""}.`,
    severity: "success",
    link: "/bills",
    metadata: { bill_id: bill.id },
  });
}
