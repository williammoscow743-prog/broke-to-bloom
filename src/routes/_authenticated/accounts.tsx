import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Archive,
  ChevronLeft,
  CreditCard,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { ACCOUNT_TYPES, fmt, isoDate } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
});

type Account = {
  id: string;
  name: string;
  type: string;
  opening_balance: number;
  currency: string;
  archived: boolean;
  color: string | null;
  icon: string | null;
};

type EntryLite = {
  account_id: string | null;
  type: "income" | "expense";
  amount: number;
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

function AccountsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const accountsQ = useQuery({
    queryKey: ["accounts", user.id],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,type,opening_balance,currency,archived,color,icon")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, opening_balance: Number(a.opening_balance) })) as Account[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["entries-lite", user.id],
    queryFn: async (): Promise<EntryLite[]> => {
      const { data, error } = await supabase
        .from("cash_entries")
        .select("account_id,type,amount")
        .is("archived_at", null);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as EntryLite[];
    },
  });

  const transfersQ = useQuery({
    queryKey: ["transfers", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("from_account_id,to_account_id,amount");
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
    },
  });

  const upsert = useMutation({
    mutationFn: async (a: Partial<Account> & { name: string; type: string }) => {
      if (a.id) {
        const { error } = await supabase
          .from("accounts")
          .update({
            name: a.name,
            type: a.type,
            opening_balance: a.opening_balance ?? 0,
            color: a.color ?? null,
          })
          .eq("id", a.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert({
          user_id: user.id,
          name: a.name,
          type: a.type,
          opening_balance: a.opening_balance ?? 0,
          color: a.color ?? null,
          currency: "ZAR",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", user.id] });
      toast.success("Account saved");
      setShowAdd(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const archive = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from("accounts").update({ archived }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts", user.id] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts", user.id] });
      toast.success("Account deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Cannot delete — remove transactions first"),
  });

  const transfer = useMutation({
    mutationFn: async (p: { from: string; to: string; amount: number; date: string; notes: string }) => {
      if (p.from === p.to) throw new Error("Pick two different accounts");
      const { error } = await supabase.from("transfers").insert({
        user_id: user.id,
        from_account_id: p.from,
        to_account_id: p.to,
        amount: p.amount,
        transfer_date: p.date,
        notes: p.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfers", user.id] });
      toast.success("Transfer recorded");
      setShowTransfer(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const accounts = accountsQ.data ?? [];
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, a.opening_balance);
    for (const e of entriesQ.data ?? []) {
      if (!e.account_id) continue;
      const cur = map.get(e.account_id) ?? 0;
      map.set(e.account_id, cur + (e.type === "income" ? e.amount : -e.amount));
    }
    for (const t of transfersQ.data ?? []) {
      map.set(t.from_account_id, (map.get(t.from_account_id) ?? 0) - t.amount);
      map.set(t.to_account_id, (map.get(t.to_account_id) ?? 0) + t.amount);
    }
    return map;
  }, [accounts, entriesQ.data, transfersQ.data]);

  const totalBalance = active.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/dashboard" })}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="font-display text-base font-semibold leading-none">Accounts</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {active.length} active · Total {fmt(totalBalance)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTransfer(true)}
              disabled={active.length < 2}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Transfer</span>
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setShowAdd(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> New account
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-20 pt-6 sm:px-6">
        {accountsQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/60 px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Wallet className="h-6 w-6" />
            </div>
            <div className="mt-4 font-display text-lg font-semibold">No accounts yet</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add your cash, cheque, savings or credit accounts to start attributing each transaction.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Add your first account
            </button>
          </div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((a) => {
              const bal = balances.get(a.id) ?? 0;
              return (
                <div
                  key={a.id}
                  className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:shadow-lift"
                >
                  <div
                    className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-2xl"
                    style={{ background: a.color || "var(--primary)" }}
                  />
                  <div className="relative flex items-start justify-between">
                    <div
                      className="grid h-11 w-11 place-items-center rounded-2xl text-white shadow-soft"
                      style={{ background: a.color || "var(--primary)" }}
                    >
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditing(a);
                          setShowAdd(true);
                        }}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => archive.mutate({ id: a.id, archived: true })}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                        aria-label="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="relative mt-4">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                    </div>
                    <div className="mt-0.5 truncate font-display text-lg font-semibold">{a.name}</div>
                    <div className="mt-3 font-display text-2xl font-semibold tracking-tight">
                      {fmt(bal)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Opening {fmt(a.opening_balance)}
                    </div>
                  </div>
                  <Link
                    to="/transactions"
                    search={{ account: a.id } as any}
                    className="relative mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    View transactions <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </section>
        )}

        {archived.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Archived
            </h2>
            <div className="space-y-2">
              {archived.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {ACCOUNT_TYPES.find((t) => t.value === a.type)?.label ?? a.type} · {fmt(balances.get(a.id) ?? 0)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => archive.mutate({ id: a.id, archived: false })}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${a.name}? This cannot be undone.`)) del.mutate(a.id);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {showAdd && (
        <AccountSheet
          initial={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSubmit={(a) => upsert.mutate(a)}
          busy={upsert.isPending}
        />
      )}

      {showTransfer && (
        <TransferSheet
          accounts={active}
          onClose={() => setShowTransfer(false)}
          onSubmit={(p) => transfer.mutate(p)}
          busy={transfer.isPending}
        />
      )}
    </div>
  );
}

function AccountSheet({
  initial,
  onClose,
  onSubmit,
  busy,
}: {
  initial: Account | null;
  onClose: () => void;
  onSubmit: (a: Partial<Account> & { name: string; type: string }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.type ?? "cheque");
  const [opening, setOpening] = useState(String(initial?.opening_balance ?? 0));
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name is required");
    onSubmit({
      id: initial?.id,
      name: name.trim(),
      type,
      opening_balance: parseFloat(opening) || 0,
      color,
    });
  }

  return (
    <Sheet title={initial ? "Edit account" : "New account"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. FNB Cheque"
            maxLength={60}
            autoFocus
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>
        <Field label="Type">
          <div className="flex flex-wrap gap-1.5">
            {ACCOUNT_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setType(t.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  type === t.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Opening balance">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              R
            </span>
            <input
              type="number"
              step="0.01"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-8 pr-3 text-sm focus:border-ring focus:outline-none"
            />
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Create account"}
        </button>
      </form>
    </Sheet>
  );
}

function TransferSheet({
  accounts,
  onClose,
  onSubmit,
  busy,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (p: { from: string; to: string; amount: number; date: string; notes: string }) => void;
  busy: boolean;
}) {
  const [from, setFrom] = useState(accounts[0]?.id ?? "");
  const [to, setTo] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    onSubmit({ from, to, amount: n, date, notes });
  }

  return (
    <Sheet title="Transfer between accounts" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              R
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-8 pr-3 text-sm focus:border-ring focus:outline-none"
            />
          </div>
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Record transfer"}
        </button>
      </form>
    </Sheet>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-lift animate-scale-in sm:rounded-3xl max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
