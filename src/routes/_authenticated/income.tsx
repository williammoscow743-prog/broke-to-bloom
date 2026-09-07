import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, isoDate } from "@/lib/finance";
import {
  INCOME_CATEGORIES,
  INCOME_SELECT,
  RECURRENCES,
  computeIncomeStats,
  expectedLabel,
  incomeStatus,
  incomeStatusTone,
  nextExpectedDate,
  normaliseIncome,
  type UpcomingIncome,
} from "@/lib/income";
import { notifyIncomeReceived, syncIncomeNotifications } from "@/lib/income-notifications";
import {
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  ChevronLeft,
  Copy,
  LayoutGrid,
  Pencil,
  Plus,
  Rows3,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

const FILTERS = ["all", "expected", "received", "cancelled", "overdue", "recurring", "archived"] as const;
type Filter = (typeof FILTERS)[number];

const SORTS = [
  { value: "date", label: "Expected date" },
  { value: "amount", label: "Amount" },
  { value: "name", label: "Name" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

export const Route = createFileRoute("/_authenticated/income")({
  validateSearch: (search: Record<string, unknown>) => ({
    filter: (FILTERS as readonly string[]).includes(String(search.filter))
      ? (String(search.filter) as Filter)
      : ("all" as Filter),
    open: typeof search.open === "string" ? search.open : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Upcoming Income — Broke to Bloom" },
      { name: "description", content: "Track expected income, mark payments as received and plan your cash flow." },
      { property: "og:title", content: "Upcoming Income — Broke to Bloom" },
      { property: "og:description", content: "Track expected income, mark payments as received and plan your cash flow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IncomePage,
});

type AccountLite = { id: string; name: string };

function IncomePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();

  const [view, setView] = useState<"table" | "cards">("table");
  const [filter, setFilter] = useState<Filter>(search.filter);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort>("date");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<UpcomingIncome | "new" | null>(null);

  const incomeQ = useQuery({
    queryKey: ["upcoming-income", user.id],
    queryFn: async (): Promise<UpcomingIncome[]> => {
      const { data, error } = await supabase
        .from("upcoming_income")
        .select(INCOME_SELECT)
        .order("expected_date", { ascending: true });
      if (error) throw error;
      const list = (data ?? []).map((r) => normaliseIncome(r as Record<string, unknown>));
      void syncIncomeNotifications(user.id, list).then((n) => {
        if (n > 0) qc.invalidateQueries({ queryKey: ["notifications"] });
      });
      return list;
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

  const list = incomeQ.data ?? [];

  useEffect(() => {
    if (!search.open) return;
    const target = list.find((i) => i.id === search.open);
    if (target) setEditing(target);
  }, [search.open, list]);

  const accountName = (id: string | null) => accountsQ.data?.find((a) => a.id === id)?.name ?? "—";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["upcoming-income"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
  };

  const save = useMutation({
    mutationFn: async (payload: Partial<UpcomingIncome> & { id?: string }) => {
      const { id, ...rest } = payload as Record<string, unknown> & { id?: string };
      if (id) {
        const { error } = await supabase.from("upcoming_income").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("upcoming_income")
          .insert({ ...rest, user_id: user.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      invalidate();
      setEditing(null);
      toast.success(v.id ? "Income updated" : "Income added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("upcoming_income").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Income deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("upcoming_income")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.archived ? "Income archived" : "Income restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (inc: UpcomingIncome) => {
      const { error } = await supabase.from("upcoming_income").insert({
        user_id: user.id,
        name: `${inc.name} (copy)`,
        amount: inc.amount,
        expected_date: inc.expected_date,
        category: inc.category,
        source: inc.source,
        account_id: inc.account_id,
        recurrence: inc.recurrence,
        notes: inc.notes,
        status: "expected",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Income duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async ({ inc, cancelled }: { inc: UpcomingIncome; cancelled: boolean }) => {
      const { error } = await supabase
        .from("upcoming_income")
        .update({ status: cancelled ? "cancelled" : "expected" })
        .eq("id", inc.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      toast.success(v.cancelled ? "Income cancelled" : "Income re-opened");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Marks income as received: creates exactly one cash entry, then schedules the next occurrence. */
  const receive = useMutation({
    mutationFn: async (inc: UpcomingIncome) => {
      let entryId = inc.entry_id;

      if (!entryId) {
        const { data: entry, error: entryErr } = await supabase
          .from("cash_entries")
          .insert({
            user_id: user.id,
            entry_date: isoDate(new Date()),
            type: "income",
            category: inc.category ?? "Other",
            description: inc.name,
            amount: inc.amount,
            account_id: inc.account_id,
            merchant: inc.source,
            notes: inc.notes,
            status: "cleared",
          })
          .select("id")
          .single();
        if (entryErr) throw entryErr;
        entryId = entry?.id ?? null;
      }

      const { error } = await supabase
        .from("upcoming_income")
        .update({
          status: "received",
          received_at: new Date().toISOString(),
          entry_id: entryId,
        })
        .eq("id", inc.id);
      if (error) throw error;

      await notifyIncomeReceived(user.id, inc);

      // Schedule the next occurrence for recurring income, guarding against duplicates.
      const next = nextExpectedDate(inc.expected_date, inc.recurrence);
      if (next) {
        const { data: dupe } = await supabase
          .from("upcoming_income")
          .select("id")
          .eq("name", inc.name)
          .eq("expected_date", next)
          .limit(1);
        if (!dupe || dupe.length === 0) {
          await supabase.from("upcoming_income").insert({
            user_id: user.id,
            name: inc.name,
            amount: inc.amount,
            expected_date: next,
            category: inc.category,
            source: inc.source,
            account_id: inc.account_id,
            recurrence: inc.recurrence,
            notes: inc.notes,
            status: "expected",
          });
        }
      }
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Income received — transaction created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => computeIncomeStats(list), [list]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = list.filter((i) => {
      const st = incomeStatus(i);
      if (filter === "archived") {
        if (!i.archived_at) return false;
      } else if (i.archived_at) return false;
      if (filter === "expected" && st !== "expected") return false;
      if (filter === "received" && st !== "received") return false;
      if (filter === "cancelled" && st !== "cancelled") return false;
      if (filter === "overdue" && st !== "overdue") return false;
      if (filter === "recurring" && i.recurrence === "one-time") return false;
      if (category !== "all" && (i.category ?? "Other") !== category) return false;
      if (!term) return true;
      return (
        i.name.toLowerCase().includes(term) ||
        (i.source ?? "").toLowerCase().includes(term) ||
        (i.category ?? "").toLowerCase().includes(term)
      );
    });
    return rows.sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "name") return a.name.localeCompare(b.name);
      return a.expected_date.localeCompare(b.expected_date);
    });
  }, [list, filter, category, q, sort]);

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
              <h1 className="font-display text-base font-semibold leading-none">Upcoming Income</h1>
              <div className="mt-1 text-[11px] text-muted-foreground">Forecast only until marked received</div>
            </div>
          </div>
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white shadow-soft"
            style={{ background: "var(--gradient-money)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Income
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Expected this month" value={stats.expectedThisMonth.length} sub={fmt(stats.totalExpectedThisMonth)} />
          <StatCard label="Due in 7 days" value={stats.dueSoon.length} sub={fmt(stats.totalDueSoon)} />
          <StatCard label="Received this month" value={stats.receivedThisMonth.length} sub={fmt(stats.totalReceivedThisMonth)} tone="good" />
          <StatCard label="Overdue" value={stats.overdue.length} sub={fmt(stats.totalOverdue)} tone="danger" />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, source or category"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
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
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs outline-none"
              aria-label="Sort by"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>Sort: {s.label}</option>
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

        {incomeQ.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-12 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-3 font-display text-lg font-semibold">No income here</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your salary, invoices or refunds to forecast the cash flow ahead.
            </p>
            <button onClick={() => setEditing("new")} className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-muted">
              Add your first income
            </button>
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-soft">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Income</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Amount</th>
                  <th className="px-3 py-3 font-medium">Expected</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Account</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Recurrence</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => {
                  const st = incomeStatus(i);
                  return (
                    <tr key={i.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="font-medium">{i.name}</div>
                        {i.notes && <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{i.notes}</div>}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{i.category ?? "—"}</td>
                      <td className="px-3 py-3 font-medium">{fmt(i.amount)}</td>
                      <td className="px-3 py-3">
                        <div>{i.expected_date}</div>
                        <div className="text-[11px] text-muted-foreground">{expectedLabel(i.expected_date, st)}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{i.source ?? "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{accountName(i.account_id)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${incomeStatusTone(st)}`}>{st}</span>
                      </td>
                      <td className="px-3 py-3 capitalize text-muted-foreground">{i.recurrence}</td>
                      <td className="px-4 py-3">
                        <RowActions
                          income={i}
                          status={st}
                          onEdit={() => setEditing(i)}
                          onReceive={() => receive.mutate(i)}
                          onCancel={(c) => cancel.mutate({ inc: i, cancelled: c })}
                          onArchive={(a) => archive.mutate({ id: i.id, archived: a })}
                          onDuplicate={() => duplicate.mutate(i)}
                          onDelete={() => remove.mutate(i.id)}
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
            {visible.map((i) => {
              const st = incomeStatus(i);
              return (
                <div key={i.id} className="rounded-3xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-display text-base font-semibold">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground">{i.category ?? "—"} · {i.source ?? "no source"}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${incomeStatusTone(st)}`}>{st}</span>
                  </div>
                  <div className="mt-3 font-display text-2xl font-semibold">{fmt(i.amount)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Expected {i.expected_date} · {expectedLabel(i.expected_date, st)}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div><dt className="uppercase tracking-widest">Account</dt><dd className="text-foreground">{accountName(i.account_id)}</dd></div>
                    <div><dt className="uppercase tracking-widest">Recurs</dt><dd className="capitalize text-foreground">{i.recurrence}</dd></div>
                  </dl>
                  {i.notes && <p className="mt-3 rounded-xl bg-muted/50 p-2 text-[11px] text-muted-foreground">{i.notes}</p>}
                  <div className="mt-3 flex justify-end">
                    <RowActions
                      income={i}
                      status={st}
                      onEdit={() => setEditing(i)}
                      onReceive={() => receive.mutate(i)}
                      onCancel={(c) => cancel.mutate({ inc: i, cancelled: c })}
                      onArchive={(a) => archive.mutate({ id: i.id, archived: a })}
                      onDuplicate={() => duplicate.mutate(i)}
                      onDelete={() => remove.mutate(i.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {editing && (
        <IncomeSheet
          income={editing === "new" ? null : editing}
          accounts={accountsQ.data ?? []}
          busy={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(payload) => save.mutate(payload)}
        />
      )}
    </div>
  );
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
  income,
  status,
  onEdit,
  onReceive,
  onCancel,
  onArchive,
  onDuplicate,
  onDelete,
}: {
  income: UpcomingIncome;
  status: string;
  onEdit: () => void;
  onReceive: () => void;
  onCancel: (cancelled: boolean) => void;
  onArchive: (archived: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:text-foreground";
  return (
    <div className="flex items-center justify-end gap-1">
      {status !== "received" && (
        <button onClick={onReceive} className={`${btn} hover:text-emerald-500`} title="Mark as received">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      )}
      {status === "cancelled" ? (
        <button onClick={() => onCancel(false)} className={btn} title="Re-open"><ArchiveRestore className="h-3.5 w-3.5" /></button>
      ) : (
        status !== "received" && (
          <button onClick={() => onCancel(true)} className={btn} title="Mark as cancelled"><Ban className="h-3.5 w-3.5" /></button>
        )
      )}
      <button onClick={onEdit} className={btn} title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={onDuplicate} className={btn} title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
      {income.archived_at ? (
        <button onClick={() => onArchive(false)} className={btn} title="Restore"><ArchiveRestore className="h-3.5 w-3.5" /></button>
      ) : (
        <button onClick={() => onArchive(true)} className={btn} title="Archive"><Archive className="h-3.5 w-3.5" /></button>
      )}
      <button onClick={onDelete} className={`${btn} hover:text-rose-500`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function IncomeSheet({
  income,
  accounts,
  busy,
  onClose,
  onSave,
}: {
  income: UpcomingIncome | null;
  accounts: AccountLite[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Partial<UpcomingIncome> & { id?: string }) => void;
}) {
  const [form, setForm] = useState({
    name: income?.name ?? "",
    amount: income ? String(income.amount) : "",
    expected_date: income?.expected_date ?? isoDate(new Date()),
    category: income?.category ?? "Employment",
    source: income?.source ?? "",
    account_id: income?.account_id ?? "",
    recurrence: income?.recurrence ?? "monthly",
    notes: income?.notes ?? "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.name.trim() || !amount || amount <= 0) {
      toast.error("Add an income name and a valid amount");
      return;
    }
    onSave({
      id: income?.id,
      name: form.name.trim(),
      amount,
      expected_date: form.expected_date,
      category: form.category,
      source: form.source.trim() || null,
      account_id: form.account_id || null,
      recurrence: form.recurrence,
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
          <h2 className="font-display text-lg font-semibold">{income ? "Edit income" : "Add income"}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>Income name</label>
            <input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Salary" />
          </div>
          <div>
            <label className={label}>Amount</label>
            <input className={field} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className={label}>Expected date</label>
            <input className={field} type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
          </div>
          <div>
            <label className={label}>Category</label>
            <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Source</label>
            <input className={field} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Employer name" />
          </div>
          <div>
            <label className={label}>Account</label>
            <select className={field} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Unassigned</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Recurrence</label>
            <select className={field} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>
              {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
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
          {busy ? "Saving…" : income ? "Save changes" : "Add income"}
        </button>
      </form>
    </div>
  );
}
