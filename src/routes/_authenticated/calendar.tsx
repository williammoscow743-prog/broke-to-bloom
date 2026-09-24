import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Receipt, HandCoins } from "lucide-react";
import { fmt, isoDate } from "@/lib/finance";
import { BILL_SELECT, normaliseBill, effectiveStatus, statusTone, daysUntil, type Bill } from "@/lib/bills";
import { INCOME_SELECT, normaliseIncome, incomeStatus, incomeStatusTone, daysUntilIncome, type UpcomingIncome } from "@/lib/income";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

type Entry = { id: string; entry_date: string; type: "income" | "expense"; amount: number; description: string | null; category: string | null };

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selected, setSelected] = useState<string | null>(isoDate(new Date()));

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const entriesQ = useQuery({
    queryKey: ["cal-entries", user.id, isoDate(monthStart)],
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await supabase
        .from("cash_entries")
        .select("id,entry_date,type,amount,description,category")
        .gte("entry_date", isoDate(monthStart))
        .lte("entry_date", isoDate(monthEnd))
        .is("archived_at", null);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Entry[];
    },
  });

  const billsQ = useQuery({
    queryKey: ["cal-bills", user.id, isoDate(monthStart)],
    queryFn: async (): Promise<Bill[]> => {
      const { data, error } = await supabase
        .from("bills")
        .select(BILL_SELECT)
        .is("archived_at", null)
        .gte("due_date", isoDate(monthStart))
        .lte("due_date", isoDate(monthEnd));
      if (error) throw error;
      return (data ?? []).map((b) => normaliseBill(b as Record<string, unknown>));
    },
  });

  // All non-archived income (real rows only; no synthetic recurrences). Used for grid + summary.
  const incomeQ = useQuery({
    queryKey: ["cal-income", user.id],
    queryFn: async (): Promise<UpcomingIncome[]> => {
      const { data, error } = await supabase
        .from("upcoming_income")
        .select(INCOME_SELECT)
        .is("archived_at", null)
        .order("expected_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => normaliseIncome(r as Record<string, unknown>));
    },
  });
  const openIncome = (id: string) => navigate({ to: "/income", search: { filter: "all" as const, open: id } });

  const openBill = (id: string) => navigate({ to: "/bills", search: { filter: "all" as const, open: id } });

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; bills: number; count: number }>();
    for (const e of entriesQ.data ?? []) {
      const cur = map.get(e.entry_date) ?? { income: 0, expense: 0, bills: 0, count: 0 };
      if (e.type === "income") cur.income += e.amount;
      else cur.expense += e.amount;
      cur.count++;
      map.set(e.entry_date, cur);
    }
    for (const b of billsQ.data ?? []) {
      const cur = map.get(b.due_date) ?? { income: 0, expense: 0, bills: 0, count: 0 };
      cur.bills += b.amount;
      map.set(b.due_date, cur);
    }
    return map;
  }, [entriesQ.data, billsQ.data]);

  // Expected (forecast) income per day — kept separate so it never affects actual month totals.
  const expectedByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of incomeQ.data ?? []) {
      const st = incomeStatus(i);
      if (st === "received" || st === "cancelled") continue;
      map.set(i.expected_date, (map.get(i.expected_date) ?? 0) + i.amount);
    }
    return map;
  }, [incomeQ.data]);

  // Build 6-week grid (Mon start)
  const grid: (Date | null)[] = [];
  const firstDow = (monthStart.getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) grid.push(null);
  for (let d = 1; d <= monthEnd.getDate(); d++) grid.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (grid.length % 7 !== 0) grid.push(null);

  const monthTotals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const v of byDay.values()) {
      inc += v.income;
      exp += v.expense;
    }
    return { inc, exp };
  }, [byDay]);

  const selectedEntries = (entriesQ.data ?? []).filter((e) => e.entry_date === selected);
  const selectedBills = (billsQ.data ?? []).filter((b) => b.due_date === selected);

  const selectedIncome = (incomeQ.data ?? []).filter((i) => i.expected_date === selected);

  const incomeSummary = useMemo(() => {
    const open = (incomeQ.data ?? []).filter((i) => {
      const st = incomeStatus(i);
      return st === "expected" || st === "overdue";
    });
    const dueToday = open.filter((i) => daysUntilIncome(i.expected_date) === 0);
    const dueWeek = open.filter((i) => {
      const d = daysUntilIncome(i.expected_date);
      return d >= 0 && d <= 7;
    });
    const overdue = open.filter((i) => incomeStatus(i) === "overdue");
    const sum = (arr: UpcomingIncome[]) => arr.reduce((s, i) => s + i.amount, 0);
    return { dueToday, dueWeek, overdue, todayTotal: sum(dueToday), weekTotal: sum(dueWeek), overdueTotal: sum(overdue) };
  }, [incomeQ.data]);

  const billSummary = useMemo(() => {
    const list = billsQ.data ?? [];
    const today = isoDate(new Date());
    const dueToday = list.filter((b) => b.due_date === today && effectiveStatus(b) !== "paid");
    const dueWeek = list.filter((b) => {
      const d = daysUntil(b.due_date);
      return d >= 0 && d <= 7 && effectiveStatus(b) !== "paid";
    });
    const overdue = list.filter((b) => effectiveStatus(b) === "overdue");
    const sum = (arr: Bill[]) => arr.reduce((s, b) => s + b.amount, 0);
    return { dueToday, dueWeek, overdue, todayTotal: sum(dueToday), weekTotal: sum(dueWeek), overdueTotal: sum(overdue) };
  }, [billsQ.data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="font-display text-base font-semibold leading-none">Calendar</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Cash flow by day</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[130px] text-center font-display text-sm font-semibold">
              {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </div>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-20 pt-6 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Month in</div>
            <div className="mt-1 font-display text-2xl font-semibold text-emerald-500">{fmt(monthTotals.inc)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Month out</div>
            <div className="mt-1 font-display text-2xl font-semibold text-rose-500">{fmt(monthTotals.exp)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Net</div>
            <div className={`mt-1 font-display text-2xl font-semibold ${monthTotals.inc - monthTotals.exp >= 0 ? "text-foreground" : "text-rose-500"}`}>
              {fmt(monthTotals.inc - monthTotals.exp)}
            </div>
          </div>
        </div>

        {(billSummary.dueWeek.length > 0 || billSummary.overdue.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Receipt className="h-3.5 w-3.5 text-amber-600" /> Bills
            </span>
            <span className="text-muted-foreground">Due today: <strong className="text-foreground">{billSummary.dueToday.length}</strong> ({fmt(billSummary.todayTotal)})</span>
            <span className="text-muted-foreground">Next 7 days: <strong className="text-foreground">{billSummary.dueWeek.length}</strong> ({fmt(billSummary.weekTotal)})</span>
            {billSummary.overdue.length > 0 && (
              <span className="text-rose-600">Overdue: <strong>{billSummary.overdue.length}</strong> ({fmt(billSummary.overdueTotal)})</span>
            )}
            <button onClick={() => navigate({ to: "/bills", search: { filter: "all" as const, open: undefined } })} className="ml-auto text-primary hover:underline">
              View all bills
            </button>
          </div>
        )}

        {(incomeSummary.dueWeek.length > 0 || incomeSummary.overdue.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <HandCoins className="h-3.5 w-3.5 text-sky-600" /> Expected income
            </span>
            <span className="text-muted-foreground">Due today: <strong className="text-foreground">{incomeSummary.dueToday.length}</strong> ({fmt(incomeSummary.todayTotal)})</span>
            <span className="text-muted-foreground">Next 7 days: <strong className="text-foreground">{incomeSummary.dueWeek.length}</strong> ({fmt(incomeSummary.weekTotal)})</span>
            {incomeSummary.overdue.length > 0 && (
              <span className="text-rose-600">Overdue: <strong>{incomeSummary.overdue.length}</strong> ({fmt(incomeSummary.overdueTotal)})</span>
            )}
            <button onClick={() => navigate({ to: "/income", search: { filter: "all" as const, open: undefined } })} className="ml-auto text-primary hover:underline">
              View all income
            </button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                if (!d) return <div key={i} className="aspect-square rounded-lg" />;
                const key = isoDate(d);
                const info = byDay.get(key);
                const isToday = key === isoDate(new Date());
                const isSel = key === selected;
                const expected = expectedByDay.get(key) ?? 0;
                const net = (info?.income ?? 0) - (info?.expense ?? 0);
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(key)}
                    className={`relative flex aspect-square flex-col items-start justify-between rounded-lg border p-1.5 text-left text-xs transition ${
                      isSel ? "border-primary bg-primary/10" : isToday ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <span className={`text-[11px] ${isSel ? "font-semibold text-primary" : "text-foreground"}`}>{d.getDate()}</span>
                    {(info || expected > 0) && (
                      <div className="flex w-full flex-col gap-0.5">
                        {(info?.income ?? 0) > 0 && <div className="h-1 rounded-full bg-emerald-500/70" style={{ width: `${Math.min(100, ((info?.income ?? 0) / 5000) * 100)}%` }} />}
                        {(info?.expense ?? 0) > 0 && <div className="h-1 rounded-full bg-rose-500/70" style={{ width: `${Math.min(100, ((info?.expense ?? 0) / 5000) * 100)}%` }} />}
                        {(info?.bills ?? 0) > 0 && <div className="h-1 rounded-full bg-amber-500/70" style={{ width: `${Math.min(100, ((info?.bills ?? 0) / 5000) * 100)}%` }} />}
                        {expected > 0 && <div className="h-1 rounded-full border border-dashed border-sky-500 bg-sky-500/30" style={{ width: `${Math.min(100, (expected / 5000) * 100)}%` }} />}
                      </div>
                    )}
                    {info && (
                      <span className={`hidden sm:block text-[10px] font-medium ${net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {net >= 0 ? "+" : ""}
                        {Math.round(net)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Income</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Expense</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Bill due</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Expected income</span>
            </div>
          </div>

          <aside className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Selected</div>
              <div className="font-display text-lg font-semibold">
                {selected ? new Date(selected + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Pick a day"}
              </div>
            </div>
            {selectedBills.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-amber-600">Bills due</div>
                <ul className="space-y-1.5">
                  {selectedBills.map((b) => {
                    const st = effectiveStatus(b);
                    return (
                      <li key={b.id}>
                        <button
                          onClick={() => openBill(b.id)}
                          className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-sm transition hover:bg-amber-500/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <Receipt className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                              <span className={`truncate ${st === "paid" ? "line-through opacity-70" : ""}`}>{b.name}</span>
                            </span>
                            <span className="font-medium">{fmt(b.amount)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px]">
                            <span className={`rounded-full border px-1.5 py-0.5 capitalize ${statusTone(st)}`}>{st}</span>
                            {b.category && <span className="truncate text-muted-foreground">{b.category}</span>}
                            {b.recurrence !== "one-time" && <span className="text-muted-foreground">· {b.recurrence}</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {selectedIncome.length > 0 && (
              <div className="mb-4">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-sky-600">Upcoming income</div>
                <ul className="space-y-1.5">
                  {selectedIncome.map((i) => {
                    const st = incomeStatus(i);
                    return (
                      <li key={i.id}>
                        <button
                          onClick={() => openIncome(i.id)}
                          className="w-full rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-sm transition hover:bg-sky-500/20"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <HandCoins className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                              <span className={`truncate ${st === "cancelled" ? "line-through opacity-70" : ""}`}>{i.name}</span>
                            </span>
                            <span className="font-medium text-emerald-600">+{fmt(i.amount)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                            <span className={`rounded-full border px-1.5 py-0.5 capitalize ${incomeStatusTone(st)}`}>{st}</span>
                            {i.source && <span className="truncate text-muted-foreground">{i.source}</span>}
                            <span className="text-muted-foreground">· {i.expected_date}</span>
                            <span className="text-muted-foreground">· {i.recurrence}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {selectedEntries.length === 0 && selectedBills.length === 0 && selectedIncome.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No activity for this day.</div>
            ) : (
              <ul className="space-y-1.5">
                {selectedEntries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {e.type === "income" ? <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" /> : <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />}
                      <span className="truncate">{e.description || e.category || "Entry"}</span>
                    </span>
                    <span className={`font-medium ${e.type === "income" ? "text-emerald-600" : "text-foreground"}`}>
                      {e.type === "income" ? "+" : "−"}{fmt(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
