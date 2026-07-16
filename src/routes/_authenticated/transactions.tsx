import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Archive,
  ChevronLeft,
  Copy,
  Filter,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  SAVINGS_CATEGORY,
  TRANSACTION_STATUSES,
  fmt,
  isoDate,
} from "@/lib/finance";
import { Sheet, Field } from "./accounts";

const searchSchema = z.object({
  account: z.string().optional(),
  q: z.string().optional(),
  type: z.enum(["all", "income", "expense"]).optional(),
  category: z.string().optional(),
  method: z.string().optional(),
  range: z.enum(["all", "7d", "30d", "90d", "month"]).optional(),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).optional(),
  showArchived: z.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/transactions")({
  validateSearch: searchSchema,
  component: TransactionsPage,
});

type Txn = {
  id: string;
  entry_date: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  category: string | null;
  account_id: string | null;
  merchant: string | null;
  payment_method: string | null;
  reference: string | null;
  tags: string[] | null;
  notes: string | null;
  receipt_url: string | null;
  location: string | null;
  status: string;
  archived_at: string | null;
};

type Account = { id: string; name: string; color: string | null };

function TransactionsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Txn | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const accountsQ = useQuery({
    queryKey: ["accounts-min", user.id],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase.from("accounts").select("id,name,color").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const txnQ = useQuery({
    queryKey: ["txn-full", user.id],
    queryFn: async (): Promise<Txn[]> => {
      const { data, error } = await supabase
        .from("cash_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Txn[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: Partial<Txn> & { amount: number; type: "income" | "expense"; entry_date: string }) => {
      const payload = {
        type: p.type,
        amount: p.amount,
        entry_date: p.entry_date,
        description: p.description || null,
        category: p.category || null,
        account_id: p.account_id || null,
        merchant: p.merchant || null,
        payment_method: p.payment_method || null,
        reference: p.reference || null,
        tags: p.tags && p.tags.length ? p.tags : null,
        notes: p.notes || null,
        receipt_url: p.receipt_url || null,
        location: p.location || null,
        status: p.status || "cleared",
      };
      if (p.id) {
        const { error } = await supabase.from("cash_entries").update(payload).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cash_entries").insert({ ...payload, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["txn-full", user.id] });
      qc.invalidateQueries({ queryKey: ["entries", user.id] });
      qc.invalidateQueries({ queryKey: ["entries-lite", user.id] });
      toast.success("Saved");
      setEditing(null);
      setShowAdd(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const bulk = useMutation({
    mutationFn: async ({ ids, op }: { ids: string[]; op: "delete" | "archive" | "restore" }) => {
      if (op === "delete") {
        const { error } = await supabase.from("cash_entries").delete().in("id", ids);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cash_entries")
          .update({ archived_at: op === "archive" ? new Date().toISOString() : null })
          .in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["txn-full", user.id] });
      qc.invalidateQueries({ queryKey: ["entries", user.id] });
      qc.invalidateQueries({ queryKey: ["entries-lite", user.id] });
      toast.success(`${v.ids.length} ${v.op}d`);
      setSelected(new Set());
    },
  });

  const accounts = accountsQ.data ?? [];
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const all = txnQ.data ?? [];

  const showArchived = search.showArchived ?? false;
  const q = search.q ?? "";
  const typeF = search.type ?? "all";
  const cat = search.category ?? "";
  const method = search.method ?? "";
  const range = search.range ?? "all";
  const sort = search.sort ?? "date_desc";
  const accountF = search.account ?? "";

  const filtered = useMemo(() => {
    let rows = all;
    rows = showArchived ? rows.filter((r) => r.archived_at) : rows.filter((r) => !r.archived_at);
    if (accountF) rows = rows.filter((r) => r.account_id === accountF);
    if (typeF !== "all") rows = rows.filter((r) => r.type === typeF);
    if (cat) rows = rows.filter((r) => r.category === cat);
    if (method) rows = rows.filter((r) => r.payment_method === method);
    if (q) {
      const s = q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.description?.toLowerCase().includes(s) ||
          r.merchant?.toLowerCase().includes(s) ||
          r.reference?.toLowerCase().includes(s) ||
          r.notes?.toLowerCase().includes(s) ||
          r.tags?.some((t) => t.toLowerCase().includes(s)),
      );
    }
    if (range !== "all") {
      const now = new Date();
      let start = new Date();
      if (range === "7d") start.setDate(now.getDate() - 7);
      else if (range === "30d") start.setDate(now.getDate() - 30);
      else if (range === "90d") start.setDate(now.getDate() - 90);
      else if (range === "month") {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      const iso = isoDate(start);
      rows = rows.filter((r) => r.entry_date >= iso);
    }
    rows = [...rows].sort((a, b) => {
      if (sort === "date_desc") return b.entry_date.localeCompare(a.entry_date);
      if (sort === "date_asc") return a.entry_date.localeCompare(b.entry_date);
      if (sort === "amount_desc") return b.amount - a.amount;
      return a.amount - b.amount;
    });
    return rows;
  }, [all, showArchived, accountF, typeF, cat, method, q, range, sort]);

  const totals = useMemo(() => {
    let inc = 0,
      exp = 0;
    for (const r of filtered) (r.type === "income" ? (inc += r.amount) : (exp += r.amount));
    return { inc, exp, net: inc - exp };
  }, [filtered]);

  function updateSearch(patch: Partial<z.infer<typeof searchSchema>>) {
    navigate({ to: "/transactions", search: (prev: any) => ({ ...prev, ...patch }) as any });
  }

  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.id)));
  }

  const activeFilters =
    (accountF ? 1 : 0) + (typeF !== "all" ? 1 : 0) + (cat ? 1 : 0) + (method ? 1 : 0) + (range !== "all" ? 1 : 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="font-display text-base font-semibold leading-none">Transactions</div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {filtered.length} shown · Net {fmt(totals.net)}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowAdd(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 pb-20 pt-4 sm:px-6">
        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => updateSearch({ q: e.target.value || undefined })}
              placeholder="Search description, merchant, tags…"
              className="w-full rounded-full border border-input bg-card py-2.5 pl-9 pr-3 text-sm focus:border-ring focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowFilters(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Filter className="h-3.5 w-3.5" /> Filters
            {activeFilters > 0 && (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {activeFilters}
              </span>
            )}
          </button>
          <button
            onClick={() =>
              updateSearch({
                sort:
                  sort === "date_desc"
                    ? "date_asc"
                    : sort === "date_asc"
                      ? "amount_desc"
                      : sort === "amount_desc"
                        ? "amount_asc"
                        : "date_desc",
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sort === "date_desc"
              ? "Newest"
              : sort === "date_asc"
                ? "Oldest"
                : sort === "amount_desc"
                  ? "Largest"
                  : "Smallest"}
          </button>
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Income</div>
            <div className="mt-1 font-display text-sm font-semibold text-income">{fmt(totals.inc)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expense</div>
            <div className="mt-1 font-display text-sm font-semibold text-expense">{fmt(totals.exp)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</div>
            <div className={`mt-1 font-display text-sm font-semibold ${totals.net >= 0 ? "text-income" : "text-expense"}`}>
              {fmt(totals.net)}
            </div>
          </div>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="sticky top-16 z-20 flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2 shadow-soft">
            <div className="text-xs font-medium">{selected.size} selected</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => bulk.mutate({ ids: [...selected], op: showArchived ? "restore" : "archive" })}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                <Archive className="h-3.5 w-3.5" /> {showArchived ? "Restore" : "Archive"}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${selected.size} transactions?`))
                    bulk.mutate({ ids: [...selected], op: "delete" });
                }}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="rounded-3xl border border-border bg-card">
          {txnQ.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
                <Wallet className="h-6 w-6" />
              </div>
              <div className="mt-4 font-display text-base font-semibold">No transactions match</div>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Try clearing filters or add a new transaction.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-primary"
                />
                <span>Select all</span>
                <span className="ml-auto flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => updateSearch({ showArchived: e.target.checked || undefined })}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Show archived
                </span>
              </div>
              <ul className="divide-y divide-border">
                {filtered.map((r) => {
                  const acc = r.account_id ? accountMap.get(r.account_id) : null;
                  return (
                    <li
                      key={r.id}
                      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <button
                        onClick={() => setEditing(r)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                            r.type === "income" ? "bg-income/12 text-income" : "bg-expense/12 text-expense"
                          }`}
                        >
                          {r.type === "income" ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 truncate text-sm font-medium">
                            {r.description || r.merchant || (r.type === "income" ? "Income" : "Expense")}
                            {r.receipt_url && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                            {r.status !== "cleared" && (
                              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                                {r.status}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{r.entry_date}</span>
                            {r.category && (
                              <>
                                <span>·</span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5">{r.category}</span>
                              </>
                            )}
                            {r.payment_method && (
                              <>
                                <span>·</span>
                                <span>{r.payment_method}</span>
                              </>
                            )}
                            {acc && (
                              <>
                                <span>·</span>
                                <span
                                  className="rounded-full px-1.5 py-0.5 text-white"
                                  style={{ background: acc.color || "var(--primary)" }}
                                >
                                  {acc.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-sm font-semibold ${r.type === "income" ? "text-income" : "text-expense"}`}
                        >
                          {r.type === "income" ? "+" : "−"}
                          {fmt(r.amount)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </main>

      {(showAdd || editing) && (
        <TxnSheet
          initial={editing}
          accounts={accounts}
          userId={user.id}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSubmit={(p) => upsert.mutate(p)}
          onDuplicate={(p) => upsert.mutate({ ...p, id: undefined })}
          busy={upsert.isPending}
        />
      )}

      {showFilters && (
        <FiltersSheet
          accounts={accounts}
          current={{ accountF, typeF, cat, method, range }}
          onClose={() => setShowFilters(false)}
          onApply={(p) => {
            updateSearch({
              account: p.account || undefined,
              type: p.type === "all" ? undefined : p.type,
              category: p.category || undefined,
              method: p.method || undefined,
              range: p.range === "all" ? undefined : p.range,
            });
            setShowFilters(false);
          }}
          onClear={() => {
            navigate({ to: "/transactions", search: {} as any });
            setShowFilters(false);
          }}
        />
      )}
    </div>
  );
}

function TxnSheet({
  initial,
  accounts,
  userId,
  onClose,
  onSubmit,
  onDuplicate,
  busy,
}: {
  initial: Txn | null;
  accounts: Account[];
  userId: string;
  onClose: () => void;
  onSubmit: (p: Partial<Txn> & { amount: number; type: "income" | "expense"; entry_date: string }) => void;
  onDuplicate: (p: Partial<Txn> & { amount: number; type: "income" | "expense"; entry_date: string }) => void;
  busy: boolean;
}) {
  const [type, setType] = useState<"income" | "expense">(initial?.type ?? "expense");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [accountId, setAccountId] = useState(initial?.account_id ?? "");
  const [method, setMethod] = useState(initial?.payment_method ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [tags, setTags] = useState(initial?.tags?.join(", ") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [status, setStatus] = useState(initial?.status ?? "cleared");
  const [date, setDate] = useState(initial?.entry_date ?? isoDate(new Date()));
  const [receiptUrl, setReceiptUrl] = useState(initial?.receipt_url ?? "");
  const [uploading, setUploading] = useState(false);

  const cats = type === "income" ? INCOME_CATEGORIES : [...EXPENSE_CATEGORIES, SAVINGS_CATEGORY];

  async function uploadReceipt(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(path, file, { upsert: false });
      if (error) throw error;
      setReceiptUrl(path);
      toast.success("Receipt uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function build() {
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      toast.error("Enter an amount greater than 0");
      return null;
    }
    return {
      id: initial?.id,
      type,
      amount: n,
      entry_date: date,
      description: description.trim(),
      merchant: merchant.trim(),
      category,
      account_id: accountId,
      payment_method: method,
      reference: reference.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim(),
      location: location.trim(),
      status,
      receipt_url: receiptUrl,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = build();
    if (b) onSubmit(b);
  }

  return (
    <Sheet title={initial ? "Edit transaction" : "New transaction"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="inline-flex w-full rounded-full bg-muted p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setType("expense");
              setCategory("");
            }}
            className={`flex-1 rounded-full px-3 py-2 transition ${type === "expense" ? "bg-expense text-expense-foreground shadow-soft" : "text-muted-foreground"}`}
          >
            Money Out
          </button>
          <button
            type="button"
            onClick={() => {
              setType("income");
              setCategory("");
            }}
            className={`flex-1 rounded-full px-3 py-2 transition ${type === "income" ? "bg-income text-income-foreground shadow-soft" : "text-muted-foreground"}`}
          >
            Money In
          </button>
        </div>

        <Field label="Amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R</span>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-xl border border-input bg-background py-3 pl-8 pr-3 text-lg font-semibold focus:border-ring focus:outline-none"
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm capitalize focus:border-ring focus:outline-none"
            >
              {TRANSACTION_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Category">
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCategory(c === category ? "" : c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  category === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Account">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">None</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Method">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            >
              <option value="">None</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Merchant">
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Woolworths"
              maxLength={120}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </Field>
          <Field label="Reference">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Invoice #"
              maxLength={120}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it?"
            maxLength={200}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>

        <Field label="Tags (comma separated)">
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="groceries, weekly"
            maxLength={200}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>

        <Field label="Location">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Optional"
            maxLength={200}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>

        <Field label="Receipt">
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : receiptUrl ? "Replace" : "Upload"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadReceipt(e.target.files[0])}
              />
            </label>
            {receiptUrl && (
              <>
                <span className="truncate text-[11px] text-muted-foreground">Attached</span>
                <button
                  type="button"
                  onClick={() => setReceiptUrl("")}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        </Field>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-60"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add transaction"}
          </button>
          {initial && (
            <button
              type="button"
              onClick={() => {
                const b = build();
                if (b) onDuplicate(b);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-medium text-muted-foreground hover:text-foreground"
              title="Duplicate"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

function FiltersSheet({
  accounts,
  current,
  onClose,
  onApply,
  onClear,
}: {
  accounts: Account[];
  current: { accountF: string; typeF: "all" | "income" | "expense"; cat: string; method: string; range: "all" | "7d" | "30d" | "90d" | "month" };
  onClose: () => void;
  onApply: (p: {
    account: string;
    type: "all" | "income" | "expense";
    category: string;
    method: string;
    range: "all" | "7d" | "30d" | "90d" | "month";
  }) => void;
  onClear: () => void;
}) {
  const [account, setAccount] = useState(current.accountF);
  const [type, setType] = useState(current.typeF);
  const [category, setCategory] = useState(current.cat);
  const [method, setMethod] = useState(current.method);
  const [range, setRange] = useState(current.range);

  const cats = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, SAVINGS_CATEGORY])];

  return (
    <Sheet title="Filters" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Date range">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "7d", "30d", "90d", "month"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${range === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {r === "all" ? "All time" : r === "month" ? "This month" : `Last ${r}`}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Type">
          <div className="flex gap-1.5">
            {(["all", "income", "expense"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Account">
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategory("")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${!category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
            >
              Any
            </button>
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c === category ? "" : c)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${category === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Payment method">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setMethod("")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${!method ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
            >
              Any
            </button>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m === method ? "" : m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${method === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClear}
            className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
          <button
            onClick={() => onApply({ account, type, category, method, range })}
            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </Sheet>
  );
}
