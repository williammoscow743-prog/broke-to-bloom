import { supabase } from "@/integrations/supabase/client";
import { fmt, isoDate } from "./finance";
import { computeIncomeStats, daysUntilIncome, type UpcomingIncome } from "./income";

type Pending = {
  kind: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "success";
  incomeId: string;
};

/**
 * Creates upcoming-income notifications (expected tomorrow, due today, overdue, recurring).
 * Safe to call repeatedly — it skips notifications already created today for an income record.
 */
export async function syncIncomeNotifications(userId: string, list: UpcomingIncome[]) {
  const active = list.filter((i) => !i.archived_at);
  if (active.length === 0) return 0;

  const stats = computeIncomeStats(active);
  const pending: Pending[] = [];

  for (const i of stats.expected) {
    const d = daysUntilIncome(i.expected_date);
    if (d === 0) {
      pending.push({
        kind: "income_due_today",
        title: `${i.name} is expected today`,
        body: `${fmt(i.amount)} expected${i.source ? ` from ${i.source}` : ""}.`,
        severity: "info",
        incomeId: i.id,
      });
    } else if (d === 1) {
      pending.push({
        kind: "income_expected_tomorrow",
        title: `${i.name} is expected tomorrow`,
        body: `${fmt(i.amount)} expected on ${i.expected_date}.`,
        severity: "info",
        incomeId: i.id,
      });
    }
    if (i.recurrence !== "one-time" && d >= 0 && d <= 2) {
      pending.push({
        kind: "income_recurring",
        title: `${i.name} recurs ${i.recurrence}`,
        body: `Next ${i.recurrence} income of ${fmt(i.amount)} on ${i.expected_date}.`,
        severity: "info",
        incomeId: i.id,
      });
    }
  }

  for (const i of stats.overdue) {
    pending.push({
      kind: "income_overdue",
      title: `Late income: ${i.name}`,
      body: `${fmt(i.amount)} was expected on ${i.expected_date} and hasn't been received.`,
      severity: "warning",
      incomeId: i.id,
    });
  }

  if (pending.length === 0) return 0;

  const since = isoDate(new Date()) + "T00:00:00.000Z";
  const { data: existing } = await supabase
    .from("notifications")
    .select("kind,metadata")
    .gte("created_at", since)
    .like("kind", "income%");

  const seen = new Set(
    (existing ?? []).map(
      (n) => `${n.kind}:${(n.metadata as { income_id?: string } | null)?.income_id ?? ""}`,
    ),
  );

  const rows = pending
    .filter((p) => !seen.has(`${p.kind}:${p.incomeId}`))
    .map((p) => ({
      user_id: userId,
      kind: p.kind,
      title: p.title,
      body: p.body,
      severity: p.severity,
      link: "/income",
      metadata: { income_id: p.incomeId },
    }));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) return 0;
  return rows.length;
}

export async function notifyIncomeReceived(userId: string, inc: UpcomingIncome) {
  await supabase.from("notifications").insert({
    user_id: userId,
    kind: "income_received",
    title: `${inc.name} marked as received`,
    body: `${fmt(inc.amount)} added to your balance${inc.source ? ` from ${inc.source}` : ""}.`,
    severity: "success",
    link: "/income",
    metadata: { income_id: inc.id },
  });
}
