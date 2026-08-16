import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, isoDate } from "@/lib/finance";
import {
  BILL_CATEGORIES,
  BILL_SELECT,
  RECURRENCES,
  REMINDERS,
  SUBSCRIPTION_CATEGORIES,
  UTILITY_CATEGORIES,
  computeBillStats,
  daysUntil,
  effectiveStatus,
  nextDueDate,
  normaliseBill,
  reminderLabel,
  statusTone,
  type Bill,
} from "@/lib/bills";
import { notifyBillPaid, syncBillNotifications } from "@/lib/bill-notifications";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Copy,
  LayoutGrid,
  Pencil,
  Plus,
  Receipt,
  Rows3,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

const FILTERS = ["all", "upcoming", "paid", "overdue", "recurring", "archived"] as const;

export const Route = createFileRoute("/_authenticated/bills")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (FILTERS as readonly string[]).includes(String(search.filter))
      ? (String(search.filter) as Filter)
      : ("all" as Filter),
    open: typeof search.open === "string" ? search.open : undefined,
  }),
  component: BillsPage,
});

type AccountLite = { id: string; name: string };
type Filter = "all" | "upcoming" | "paid" | "overdue" | "recurring" | "archived";

const PAYMENT_METHODS = ["Cash", "Card", "EFT", "Debit Order", "Instant EFT", "Other"];

function BillsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [view, setView] = useState<"table" | "cards">("table");
  const [tab, setTab] = useState<"list" | "reports">("list");
  const search = Route.useSearch();
  const [filter, setFilter] = useState<Filter>(search.filter);
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Bill | "new" | null>(null);

  const billsQ = useQuery({
    queryKey: ["bills", user.id],
    queryFn: async (): Promise<Bill[]> => {
      const { data, error } = await supabase.from("bills").select(BILL_SELECT).order("due_date", { ascending: true });
      if (error) throw error;
      const bills = (data ?? []).map((b) => normaliseBill(b as Record<string, unknown>));
      void syncBillNotifications(user.id, bills).then((n) => {
        if (n > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
      });
      return bills;
    },
  });

  const accountsQ = useQuery({
    queryKey: ["accounts-lite", user.id],
    queryFn: async (): Promise<AccountLite[]> => {
      const { data, error } = await supabase.from("accounts").select("id,name").eq("archived", false).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const bills = billsQ.data ?? [];

  useEffect(() => {
    if (!search.open) return;
    const target = bills.find((b) => b.id === search.open);
    if (target) setEditing(target);
  }, [search.open, bills]);
  const accountName = (id: string | null) => accountsQ.data?.find((a) => a.id === id)?.name ?? "—";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["cal-bills"] });
    qc.invalidateQueries({ queryKey: ["dash-bills"] });
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<Bill> & { id?: string }) => {
      const { id, ...rest } =
        payload as Record<string, unknown> & { id?: string };
      if (id) {
        const { error } = await supabase.from("bills").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("bills").insert({ ...rest, user_id: user.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      invalidate();
      setEditing(null);
      toast.success(v.id ? "Bill updated" : "Bill added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Bill deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPaid = useMutation({
    mutationFn: async ({ bill, paid }: { bill: Bill; paid: boolean }) => {
      const { error } = await supabase
        .from("bills")
        .update({
          paid,
          paid_at: paid ? new Date().toISOString() : null,
          status: paid ? "paid" : "upcoming",
        })
        .eq("id", bill.id);
      if (error) throw error;
      if (paid) {
        await notifyBillPaid(user.id, bill);
        const next = nextDueDate(bill.due_date, bill.recurrence);
        if (next) {
          await supabase.from("bills").insert({
            user_id: user.id,
            name: bill.name,
            amount: bill.amount,
            due_date: next,
            category: bill.category,
            account_id: bill.account_id,
            payment_method: bill.payment_method,
            merchant: bill.merchant,
            recurrence: bill.recurrence,
            reminder_days: bill.reminder_days,
            notes: bill.notes,
            status: "upcoming",
          });
        }
      }
    },
    onSuccess: (_d, v) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(v.paid ? "Marked as paid" : "Marked as unpaid");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("bills")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.archived ? "Bill archived" : "Bill restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (bill: Bill) => {
      const { error } = await supabase.from("bills").insert({
        user_id: user.id,
        name: `${bill.name} (copy)`,
        amount: bill.amount,
        due_date: bill.due_date,
        category: bill.category,
        account_id: bill.account_id,
        payment_method: bill.payment_method,
        merchant: bill.merchant,
        recurrence: bill.recurrence,
        reminder_days: bill.reminder_days,
        notes: bill.notes,
        status: "upcoming",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Bill duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => computeBillStats(bills), [bills]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return bills.filter((b) => {
      const st = effectiveStatus(b);
      if (filter === "archived") {
        if (!b.archived_at) return false;
      } else if (b.archived_at) return false;
      if (filter === "upcoming" && st !== "upcoming") return false;
      if (filter === "paid" && st !== "paid") return false;
      if (filter === "overdue" && st !== "overdue") return false;
      if (filter === "recurring" && b.recurrence === "one-time") return false;
      if (category !== "all" && (b.category ?? "Other") !== category) return false;
      if (!term) return true;
      return (
        b.name.toLowerCase().includes(term) ||
        (b.category ?? "").toLowerCase().includes(term) ||
        (b.merchant ?? "").toLowerCase().includes(term) ||
        String(b.amount).includes(term)
      );
    });
  }, [bills, filter, category, q]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
              aria-label="Back to dashboard"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="font-display text-base font-semibold leading-none">Bills</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Due dates, reminders & recurrence</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden rounded-full border border-border bg-card p-0.5 sm:flex">
              <button
                onClick={() => setTab("list")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === "list" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              >
                List
              </button>
              <button
                onClick={() => setTab("reports")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === "reports" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              >
                <BarChart3 className="h-3.5 w-3.5" /> Reports
              </button>
            </div>
            <button
              onClick={() => setEditing("new")}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white shadow-soft"
              style={{ background: "var(--gradient-money)" }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Bill
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Upcoming" value={stats.upcoming.length} sub={fmt(stats.upcoming.reduce((s, b) => s + b.amount, 0))} />
          <StatCard label="Due this week" value={stats.dueThisWeek.length} sub={fmt(stats.dueThisWeek.reduce((s, b) => s + b.amount, 0))} />
          <StatCard label="Due this month" value={stats.dueThisMonth.length} sub={fmt(stats.totalDueThisMonth)} />
          <StatCard label="Overdue" value={stats.overdue.length} sub={fmt(stats.totalOverdue)} tone="danger" />
          <StatCard label="Paid this month" value={stats.paidThisMonth.length} sub={fmt(stats.totalPaidThisMonth)} tone="good" />
        </section>

        <div className="flex sm:hidden">
          <div className="flex w-full rounded-full border border-border bg-card p-0.5">
            <button onClick={() => setTab("list")} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${tab === "list" ? "bg-muted" : "text-muted-foreground"}`}>List</button>
            <button onClick={() => setTab("reports")} className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${tab === "reports" ? "bg-muted" : "text-muted-foreground"}`}>Reports</button>
          </div>
        </div>

        {tab === "reports" ? (
          <BillReports bills={bills} />
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, category, merchant or amount"
                  className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(FILTERS as readonly Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                      filter === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs outline-none"
                >
                  <option value="all">All categories</option>
                  {BILL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <div className="flex rounded-full border border-border p-0.5">
                  <button onClick={() => setView("table")} className={`grid h-7 w-7 place-items-center rounded-full ${view === "table" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Table view">
                    <Rows3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setView("cards")} className={`grid h-7 w-7 place-items-center rounded-full ${view === "cards" ? "bg-muted" : "text-muted-foreground"}`} aria-label="Card view">
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>

            {billsQ.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-border bg-card p-12 text-center">
                <Receipt className="mx-auto h-8 w-8 text-muted-foreground" />
                <div className="mt-3 font-display text-lg font-semibold">No bills here</div>
                <p className="mt-1 text-sm text-muted-foreground">Add your rent, utilities and subscriptions to never miss a due date.</p>
                <button onClick={() => setEditing("new")} className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted">
                  Add your first bill
                </button>
              </div>
            ) : view === "table" ? (
              <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-soft">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Bill</th>
                      <th className="px-3 py-3 font-medium">Category</th>
                      <th className="px-3 py-3 font-medium">Amount</th>
                      <th className="px-3 py-3 font-medium">Due</th>
                      <th className="px-3 py-3 font-medium">Method</th>
                      <th className="px-3 py-3 font-medium">Account</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Recurrence</th>
                      <th className="px-3 py-3 font-medium">Reminder</th>
                      <th className="px-3 py-3 font-medium">Merchant</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((b) => {
                      const st = effectiveStatus(b);
                      return (
                        <tr key={b.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <div className="font-medium">{b.name}</div>
                            {b.notes && <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{b.notes}</div>}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{b.category ?? "—"}</td>
                          <td className="px-3 py-3 font-medium">{fmt(b.amount)}</td>
                          <td className="px-3 py-3">
                            <div>{b.due_date}</div>
                            <div className="text-[11px] text-muted-foreground">{dueLabel(b.due_date, st)}</div>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{b.payment_method ?? "—"}</td>
                          <td className="px-3 py-3 text-muted-foreground">{accountName(b.account_id)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusTone(st)}`}>{st}</span>
                          </td>
                          <td className="px-3 py-3 capitalize text-muted-foreground">{b.recurrence}</td>
                          <td className="px-3 py-3 text-muted-foreground">{reminderLabel(b.reminder_days)}</td>
                          <td className="px-3 py-3 text-muted-foreground">{b.merchant ?? "—"}</td>
                          <td className="px-4 py-3">
                            <RowActions
                              bill={b}
                              status={st}
                              onEdit={() => setEditing(b)}
                              onPaid={(paid) => setPaid.mutate({ bill: b, paid })}
                              onArchive={(a) => archive.mutate({ id: b.id, archived: a })}
                              onDuplicate={() => duplicate.mutate(b)}
                              onDelete={() => remove.mutate(b.id)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((b) => {
                  const st = effectiveStatus(b);
                  return (
                    <div key={b.id} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-display text-base font-semibold">{b.name}</div>
                          <div className="text-[11px] text-muted-foreground">{b.category ?? "—"} · {b.merchant ?? "no merchant"}</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusTone(st)}`}>{st}</span>
                      </div>
                      <div className="mt-3 font-display text-2xl font-semibold">{fmt(b.amount)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Due {b.due_date} · {dueLabel(b.due_date, st)}</div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <div><dt className="uppercase tracking-widest">Method</dt><dd className="text-foreground">{b.payment_method ?? "—"}</dd></div>
                        <div><dt className="uppercase tracking-widest">Account</dt><dd className="text-foreground">{accountName(b.account_id)}</dd></div>
                        <div><dt className="uppercase tracking-widest">Recurs</dt><dd className="capitalize text-foreground">{b.recurrence}</dd></div>
                        <div><dt className="uppercase tracking-widest">Reminder</dt><dd className="text-foreground">{reminderLabel(b.reminder_days)}</dd></div>
                      </dl>
                      {b.notes && <p className="mt-3 rounded-xl bg-muted/50 p-2 text-[11px] text-muted-foreground">{b.notes}</p>}
                      <div className="mt-3 flex justify-end">
                        <RowActions
                          bill={b}
                          status={st}
                          onEdit={() => setEditing(b)}
                          onPaid={(paid) => setPaid.mutate({ bill: b, paid })}
                          onArchive={(a) => archive.mutate({ id: b.id, archived: a })}
                          onDuplicate={() => duplicate.mutate(b)}
                          onDelete={() => remove.mutate(b.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <BillSheet
          bill={editing === "new" ? null : editing}
          accounts={accountsQ.data ?? []}
          busy={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(payload) => save.mutate(payload)}
        />
      )}
    </div>
  );
}

function dueLabel(due: string, status: string) {
  if (status === "paid") return "settled";
  const d = daysUntil(due);
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} late`;
  return `in ${d} days`;
}

function StatCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: "danger" | "good" }) {
  const color = tone === "danger" ? "text-rose-500" : tone === "good" ? "text-emerald-500" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function RowActions({
  bill,
  status,
  onEdit,
  onPaid,
  onArchive,
  onDuplicate,
  onDelete,
}: {
  bill: Bill;
  status: string;
  onEdit: () => void;
  onPaid: (paid: boolean) => void;
  onArchive: (archived: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground";
  return (
    <div className="flex items-center justify-end gap-1">
      {status === "paid" ? (
        <button onClick={() => onPaid(false)} className={btn} title="Mark as unpaid"><Undo2 className="h-3.5 w-3.5" /></button>
      ) : (
        <button onClick={() => onPaid(true)} className={`${btn} hover:text-emerald-500`} title="Mark as paid"><CheckCircle2 className="h-3.5 w-3.5" /></button>
      )}
      <button onClick={onEdit} className={btn} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDuplicate} className={btn} title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
      {bill.archived_at ? (
        <button onClick={() => onArchive(false)} className={btn} title="Restore"><ArchiveRestore className="h-3.5 w-3.5" /></button>
      ) : (
        <button onClick={() => onArchive(true)} className={btn} title="Archive"><Archive className="h-3.5 w-3.5" /></button>
      )}
      <button onClick={onDelete} className={`${btn} hover:text-rose-500`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function BillReports({ bills }: { bills: Bill[] }) {
  const active = bills.filter((b) => !b.archived_at);
  const s = computeBillStats(active);
  const year = isoDate(new Date()).slice(0, 4);
  const annual = active.filter((b) => b.due_date.slice(0, 4) === year);
  const monthly = active.filter((b) => b.recurrence === "monthly");
  const subs = active.filter((b) => SUBSCRIPTION_CATEGORIES.includes(b.category ?? ""));
  const utils = active.filter((b) => UTILITY_CATEGORIES.includes(b.category ?? ""));
  const total = (arr: Bill[]) => arr.reduce((t, b) => t + b.amount, 0);

  const reports = [
    { title: "Upcoming Bills", rows: s.upcoming },
    { title: "Paid Bills", rows: active.filter((b) => effectiveStatus(b) === "paid") },
    { title: "Overdue Bills", rows: s.overdue },
    { title: "Monthly Bills", rows: monthly },
    { title: `Annual Bills (${year})`, rows: annual },
    { title: "Subscription Costs", rows: subs },
    { title: "Utility Costs", rows: utils },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {reports.map((r) => (
        <div key={r.title} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-base font-semibold">{r.title}</h2>
            <span className="text-sm font-medium">{fmt(total(r.rows))}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.rows.length} bill{r.rows.length === 1 ? "" : "s"}</p>
          {r.rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing to report yet.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {r.rows.slice(0, 6).map((b) => (
                <li key={b.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {b.name} <span className="text-[11px] text-muted-foreground">· {b.due_date}</span>
                  </span>
                  <span className="font-medium">{fmt(b.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function BillSheet({
  bill,
  accounts,
  busy,
  onClose,
  onSave,
}: {
  bill: Bill | null;
  accounts: AccountLite[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Partial<Bill> & { id?: string }) => void;
}) {
  const [form, setForm] = useState({
    name: bill?.name ?? "",
    amount: bill ? String(bill.amount) : "",
    due_date: bill?.due_date ?? isoDate(new Date()),
    category: bill?.category ?? "Utilities",
    payment_method: bill?.payment_method ?? "Debit Order",
    account_id: bill?.account_id ?? "",
    recurrence: bill?.recurrence ?? "monthly",
    reminder_days: bill?.reminder_days ?? 3,
    status: bill ? effectiveStatus(bill) : "upcoming",
    merchant: bill?.merchant ?? "",
    notes: bill?.notes ?? "",
  });
  const custom = !REMINDERS.some((r) => r.value === form.reminder_days);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !amount || amount <= 0) {
      toast.error("Add a bill name and a valid amount");
      return;
    }
    onSave({
      id: bill?.id,
      name: form.name.trim(),
      amount,
      due_date: form.due_date,
      category: form.category,
      payment_method: form.payment_method,
      account_id: form.account_id || null,
      recurrence: form.recurrence,
      reminder_days: Number(form.reminder_days) || 0,
      status: form.status,
      paid: form.status === "paid",
      paid_at: form.status === "paid" ? (bill?.paid_at ?? new Date().toISOString()) : null,
      merchant: form.merchant.trim() || null,
      notes: form.notes.trim() || null,
    });
  }

  const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const label = "text-[11px] uppercase tracking-widest text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-lift sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{bill ? "Edit bill" : "Add bill"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Bill name</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Electricity" />
          </div>
          <div>
            <label className={label}>Amount</label>
            <input className={field} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className={label}>Due date</label>
            <input className={field} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div>
            <label className={label}>Category</label>
            <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {BILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Payment method</label>
            <select className={field} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Account</label>
            <select className={field} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Unassigned</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
              <option value="upcoming">Upcoming</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <div>
            <label className={label}>Recurrence</label>
            <select className={field} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Reminder</label>
            <select
              className={field}
              value={custom ? "custom" : String(form.reminder_days)}
              onChange={(e) => setForm({ ...form, reminder_days: e.target.value === "custom" ? 5 : Number(e.target.value) })}
            >
              {REMINDERS.map((r) => <option key={r.value} value={String(r.value)}>{r.label}</option>)}
              <option value="custom">Custom…</option>
            </select>
            {custom && (
              <input
                className={`${field} mt-2`}
                type="number"
                min={0}
                value={form.reminder_days}
                onChange={(e) => setForm({ ...form, reminder_days: Number(e.target.value) })}
                placeholder="Days before due date"
              />
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Merchant</label>
            <input className={field} value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="City of Johannesburg" />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Notes</label>
            <textarea className={`${field} min-h-[70px]`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
          style={{ background: "var(--gradient-money)" }}
        >
          {busy ? "Saving…" : bill ? "Save changes" : "Add bill"}
        </button>
      </form>
    </div>
  );
}
