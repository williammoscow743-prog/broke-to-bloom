import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, LogOut, Plus, Trash2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Entry = {
  id: string;
  entry_date: string;
  type: "income" | "expense";
  category: string | null;
  description: string | null;
  amount: number;
};

type Settings = { user_id: string; start_date: string };

function fmt(n: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(n);
}

function daysBetween(a: string, b: Date) {
  const ad = new Date(a + "T00:00:00");
  const bd = new Date(b.toDateString());
  return Math.floor((bd.getTime() - ad.getTime()) / 86400000);
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();

  const entriesQ = useQuery({
    queryKey: ["entries", user.id],
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await supabase
        .from("cash_entries")
        .select("id, entry_date, type, category, description, amount")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Entry[];
    },
  });

  const settingsQ = useQuery({
    queryKey: ["settings", user.id],
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from("user_settings").select("*").maybeSingle();
      if (error) throw error;
      if (data) return data as Settings;
      const today = new Date().toISOString().slice(0, 10);
      const { data: created, error: insErr } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id, start_date: today })
        .select()
        .single();
      if (insErr) throw insErr;
      return created as Settings;
    },
  });

  const add = useMutation({
    mutationFn: async (payload: { type: "income" | "expense"; amount: number; description: string; entry_date: string }) => {
      const { error } = await supabase.from("cash_entries").insert({
        user_id: user.id,
        type: payload.type,
        amount: payload.amount,
        description: payload.description || null,
        entry_date: payload.entry_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", user.id] });
      toast.success("Entry added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cash_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entries", user.id] }),
  });

  const stats = useMemo(() => {
    const entries = entriesQ.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    let income = 0, expense = 0, todayIn = 0, todayOut = 0;
    for (const e of entries) {
      if (e.type === "income") income += e.amount;
      else expense += e.amount;
      if (e.entry_date === today) {
        if (e.type === "income") todayIn += e.amount;
        else todayOut += e.amount;
      }
    }
    return { income, expense, net: income - expense, todayIn, todayOut, todayNet: todayIn - todayOut };
  }, [entriesQ.data]);

  const dayNumber = settingsQ.data ? Math.min(90, Math.max(1, daysBetween(settingsQ.data.start_date, new Date()) + 1)) : 1;
  const progress = (dayNumber / 90) * 100;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg" style={{ background: "var(--gradient-money)" }} />
            <div>
              <div className="font-display text-base font-semibold leading-none">90 Days</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Broke → Cash Flow</div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Journey progress */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Your journey</div>
              <div className="mt-1 font-display text-2xl font-semibold">Day {dayNumber} of 90</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Net cash flow</div>
              <div className={`font-display text-2xl font-semibold ${stats.net >= 0 ? "text-income" : "text-expense"}`}>
                {fmt(stats.net)}
              </div>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: "var(--gradient-hero)" }}
            />
          </div>
        </section>

        {/* Today */}
        <section className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Today in" value={fmt(stats.todayIn)} tone="income" icon={<ArrowDownRight className="h-4 w-4" />} />
          <StatCard label="Today out" value={fmt(stats.todayOut)} tone="expense" icon={<ArrowUpRight className="h-4 w-4" />} />
          <StatCard label="Today net" value={fmt(stats.todayNet)} tone={stats.todayNet >= 0 ? "income" : "expense"} icon={<TrendingUp className="h-4 w-4" />} />
        </section>

        {/* Quick add */}
        <QuickAdd onAdd={(p) => add.mutate(p)} busy={add.isPending} />

        {/* Entries */}
        <section className="rounded-2xl border border-border bg-card p-2 shadow-soft sm:p-4">
          <div className="flex items-center justify-between px-3 py-2 sm:px-2">
            <h2 className="font-display text-lg font-semibold">Entries</h2>
            <span className="text-xs text-muted-foreground">
              {(entriesQ.data ?? []).length} total
            </span>
          </div>
          {entriesQ.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (entriesQ.data ?? []).length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-sm font-medium">No entries yet</div>
              <div className="mt-1 text-xs text-muted-foreground">Add your first income or expense above.</div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entriesQ.data!.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-3 sm:px-2">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      e.type === "income" ? "bg-income/15 text-income" : "bg-expense/15 text-expense"
                    }`}
                  >
                    {e.type === "income" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {e.description || (e.type === "income" ? "Income" : "Expense")}
                    </div>
                    <div className="text-xs text-muted-foreground">{e.entry_date}</div>
                  </div>
                  <div className={`text-sm font-semibold ${e.type === "income" ? "text-income" : "text-expense"}`}>
                    {e.type === "income" ? "+" : "−"}{fmt(e.amount)}
                  </div>
                  <button
                    onClick={() => del.mutate(e.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: string; tone: "income" | "expense"; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className={tone === "income" ? "text-income" : "text-expense"}>{icon}</span>
        {label}
      </div>
      <div className={`mt-2 font-display text-xl font-semibold ${tone === "income" ? "text-income" : "text-expense"}`}>
        {value}
      </div>
    </div>
  );
}

function QuickAdd({ onAdd, busy }: { onAdd: (p: { type: "income" | "expense"; amount: number; description: string; entry_date: string }) => void; busy: boolean }) {
  const [type, setType] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // Reset amount after successful mutation (parent decides via busy going false)
  useEffect(() => {
    if (!busy) return;
  }, [busy]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    onAdd({ type, amount: n, description: description.trim(), entry_date: date });
    setAmount("");
    setDescription("");
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Log an entry</h2>
        <div className="inline-flex rounded-full bg-muted p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setType("income")}
            className={`rounded-full px-3 py-1.5 transition ${type === "income" ? "bg-income text-income-foreground shadow-soft" : "text-muted-foreground"}`}
          >
            Money in
          </button>
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`rounded-full px-3 py-1.5 transition ${type === "expense" ? "bg-expense text-expense-foreground shadow-soft" : "text-muted-foreground"}`}
          >
            Money out
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R</span>
          <input
            type="number" inputMode="decimal" step="0.01" min="0" required
            value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-7 pr-3 text-sm focus:border-ring focus:outline-none"
          />
        </div>
        <input
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it?"
          maxLength={120}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
        />
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none sm:w-auto"
        />
      </div>

      <button
        type="submit" disabled={busy}
        className="mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-60"
        style={{ background: "var(--gradient-hero)" }}
      >
        <Plus className="h-4 w-4" /> Add entry
      </button>
    </form>
  );
}
