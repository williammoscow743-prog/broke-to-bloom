import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HealthScoreCard } from "@/components/HealthScoreCard";
import { computeHealthScore, computeInsights } from "@/lib/insights";
import {
  BILL_SELECT,
  computeBillInsights,
  computeBillStats,
  effectiveStatus,
  normaliseBill,
  statusTone,
  type Bill,
} from "@/lib/bills";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Calendar,
  LogOut,
  Moon,
  PiggyBank,
  Plus,
  Sparkles,
  Sun,
  Target,
  Receipt,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const SAVINGS_CATEGORY = "Savings";

const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Bills",
  "Shopping",
  "Entertainment",
  "Health",
  "Other",
];
const INCOME_CATEGORIES = ["Salary", "Freelance", "Business", "Gift", "Other"];

const PIE_COLORS = [
  "oklch(0.62 0.16 150)",
  "oklch(0.68 0.15 220)",
  "oklch(0.72 0.15 60)",
  "oklch(0.62 0.18 25)",
  "oklch(0.60 0.18 300)",
  "oklch(0.70 0.14 190)",
  "oklch(0.55 0.10 140)",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `R${(n / 1_000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

function daysBetween(a: string, b: Date) {
  const ad = new Date(a + "T00:00:00");
  const bd = new Date(b.toDateString());
  return Math.floor((bd.getTime() - ad.getTime()) / 86400000);
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const nd = new Date(d);
  const day = nd.getDay();
  const diff = (day + 6) % 7; // Monday start
  nd.setDate(nd.getDate() - diff);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return [dark, setDark] as const;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [dark, setDark] = useDarkMode();
  const [showAdd, setShowAdd] = useState(false);

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
      const today = isoDate(new Date());
      const { data: created, error: insErr } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id, start_date: today })
        .select()
        .single();
      if (insErr) throw insErr;
      return created as Settings;
    },
  });

  const billsQ = useQuery({
    queryKey: ["dash-bills", user.id],
    queryFn: async (): Promise<Bill[]> => {
      const { data, error } = await supabase
        .from("bills")
        .select(BILL_SELECT)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((b) => normaliseBill(b as Record<string, unknown>));
    },
  });

  const add = useMutation({
    mutationFn: async (payload: {
      type: "income" | "expense";
      amount: number;
      description: string;
      category: string;
      entry_date: string;
    }) => {
      const { error } = await supabase.from("cash_entries").insert({
        user_id: user.id,
        type: payload.type,
        amount: payload.amount,
        description: payload.description || null,
        category: payload.category || null,
        entry_date: payload.entry_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entries", user.id] });
      toast.success("Entry added");
      setShowAdd(false);
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

  const entries = entriesQ.data ?? [];

  const stats = useMemo(() => {
    const today = isoDate(new Date());
    const weekStart = startOfWeek(new Date());
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let income = 0,
      expense = 0,
      todayIn = 0,
      todayOut = 0,
      weekIn = 0,
      weekOut = 0,
      monthIn = 0,
      monthOut = 0,
      savings = 0;

    for (const e of entries) {
      const d = new Date(e.entry_date + "T00:00:00");
      if (e.type === "income") income += e.amount;
      else expense += e.amount;
      if (e.entry_date === today) {
        if (e.type === "income") todayIn += e.amount;
        else todayOut += e.amount;
      }
      if (d >= weekStart) {
        if (e.type === "income") weekIn += e.amount;
        else weekOut += e.amount;
      }
      if (d >= monthStart) {
        if (e.type === "income") monthIn += e.amount;
        else monthOut += e.amount;
      }
      if (e.category === SAVINGS_CATEGORY) {
        savings += e.type === "expense" ? e.amount : -e.amount;
      }
    }
    return {
      income,
      expense,
      balance: income - expense,
      todayIn,
      todayOut,
      weekIn,
      weekOut,
      monthIn,
      monthOut,
      savings: Math.max(0, savings),
    };
  }, [entries]);

  // Chart data
  const chartData = useMemo(() => {
    // Last 14 days line + area
    const days: { date: string; label: string; income: number; expense: number; net: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = isoDate(d);
      days.push({
        date: key,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        income: 0,
        expense: 0,
        net: 0,
      });
    }
    const dayMap = new Map(days.map((d) => [d.date, d]));
    for (const e of entries) {
      const bucket = dayMap.get(e.entry_date);
      if (bucket) {
        if (e.type === "income") bucket.income += e.amount;
        else bucket.expense += e.amount;
      }
    }
    days.forEach((d) => (d.net = d.income - d.expense));

    // Last 6 months bar
    const months: { key: string; label: string; income: number; expense: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: "short" }),
        income: 0,
        expense: 0,
      });
    }
    const mMap = new Map(months.map((m) => [m.key, m]));
    for (const e of entries) {
      const d = new Date(e.entry_date + "T00:00:00");
      const bucket = mMap.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) {
        if (e.type === "income") bucket.income += e.amount;
        else bucket.expense += e.amount;
      }
    }

    // Pie: current-month expense categories
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const catMap = new Map<string, number>();
    for (const e of entries) {
      if (e.type !== "expense") continue;
      const d = new Date(e.entry_date + "T00:00:00");
      if (d < monthStart) continue;
      const k = e.category || "Uncategorized";
      catMap.set(k, (catMap.get(k) || 0) + e.amount);
    }
    const pie = [...catMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Weekly spending trend - last 8 weeks
    const weeks: { label: string; expense: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = startOfWeek(new Date());
      ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      let sum = 0;
      for (const e of entries) {
        if (e.type !== "expense") continue;
        const d = new Date(e.entry_date + "T00:00:00");
        if (d >= ws && d < we) sum += e.amount;
      }
      weeks.push({
        label: `W${8 - i}`,
        expense: sum,
      });
    }

    // Savings trend - cumulative savings over last 12 weeks
    const savingsSeries: { label: string; savings: number }[] = [];
    let cumulative = 0;
    const savingsEntries = entries
      .filter((e) => e.category === SAVINGS_CATEGORY)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
    for (let i = 11; i >= 0; i--) {
      const ws = startOfWeek(new Date());
      ws.setDate(ws.getDate() - i * 7);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      for (const e of savingsEntries) {
        const d = new Date(e.entry_date + "T00:00:00");
        if (d >= ws && d < we) {
          cumulative += e.type === "expense" ? e.amount : -e.amount;
        }
      }
      savingsSeries.push({
        label: ws.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        savings: Math.max(0, cumulative),
      });
    }

    return { days, months, pie, weeks, savingsSeries };
  }, [entries]);

  const dayNumber = settingsQ.data
    ? Math.min(90, Math.max(1, daysBetween(settingsQ.data.start_date, new Date()) + 1))
    : 1;
  const progress = (dayNumber / 90) * 100;

  const bills = billsQ.data ?? [];
  const billStats = useMemo(() => computeBillStats(bills), [bills]);
  const health = useMemo(() => computeHealthScore(entries, dayNumber, bills), [entries, dayNumber, bills]);
  const insights = useMemo(
    () => [
      ...computeInsights(entries),
      ...computeBillInsights(bills, { monthIncome: stats.monthIn, balance: stats.balance }),
    ],
    [entries, bills, stats.monthIn, stats.balance],
  );


  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const loading = entriesQ.isLoading;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-soft"
              style={{ background: "var(--gradient-money)" }}
            >
              <Wallet className="h-4.5 w-4.5" strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base font-semibold leading-none tracking-tight">
                Broke to Bloom
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                Day {dayNumber} of 90 · Cash flow builder
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              to="/accounts"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              aria-label="Accounts"
            >
              <Wallet className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Accounts</span>
            </Link>
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              aria-label="Transactions"
            >
              <ArrowUpRight className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Transactions</span>
            </Link>
            <Link
              to="/bills"
              search={{ filter: "all" as const, open: undefined }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              aria-label="Bills"
            >
              <Receipt className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Bills</span>
            </Link>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              aria-label="Calendar"
            >
              <Calendar className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Calendar</span>
            </Link>

            <button
              onClick={() => setDark(!dark)}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-28 pt-6 sm:px-6 sm:pb-10">
        {/* Progress banner */}
        <section
          className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lift"
          style={{ background: "var(--gradient-hero)" }}
        >
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-white/70">
                Current balance
              </div>
              <div className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                {loading ? <Skeleton className="h-10 w-48 bg-white/20" /> : fmt(stats.balance)}
              </div>
              <div className="mt-2 text-sm text-white/80">
                {stats.balance >= 0 ? "You're in the green — keep it flowing." : "Time to tilt the flow back positive."}
              </div>
            </div>
            <div className="min-w-[220px] sm:text-right">
              <div className="text-xs uppercase tracking-widest text-white/70">90-day journey</div>
              <div className="mt-2 flex items-baseline gap-2 sm:justify-end">
                <span className="font-display text-3xl font-semibold">{dayNumber}</span>
                <span className="text-sm text-white/70">/ 90 days</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <SummaryCard
            label="Today In"
            value={fmt(stats.todayIn)}
            icon={<ArrowDownRight className="h-4 w-4" />}
            tone="income"
            loading={loading}
          />
          <SummaryCard
            label="Today Out"
            value={fmt(stats.todayOut)}
            icon={<ArrowUpRight className="h-4 w-4" />}
            tone="expense"
            loading={loading}
          />
          <SummaryCard
            label="Weekly In"
            value={fmt(stats.weekIn)}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="income"
            loading={loading}
          />
          <SummaryCard
            label="Weekly Out"
            value={fmt(stats.weekOut)}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="expense"
            loading={loading}
          />
          <SummaryCard
            label="Monthly In"
            value={fmt(stats.monthIn)}
            icon={<Calendar className="h-4 w-4" />}
            tone="income"
            loading={loading}
          />
          <SummaryCard
            label="Monthly Out"
            value={fmt(stats.monthOut)}
            icon={<Calendar className="h-4 w-4" />}
            tone="expense"
            loading={loading}
          />
          <SummaryCard
            label="Savings"
            value={fmt(stats.savings)}
            icon={<PiggyBank className="h-4 w-4" />}
            tone="brand"
            loading={loading}
          />
          <SummaryCard
            label="Net Flow"
            value={fmt(stats.monthIn - stats.monthOut)}
            icon={<Sparkles className="h-4 w-4" />}
            tone={stats.monthIn - stats.monthOut >= 0 ? "income" : "expense"}
            loading={loading}
          />
        </section>

        {/* Bills at a glance */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <BillStatCard
            label="Upcoming"
            count={billStats.upcoming.length}
            total={billStats.upcoming.reduce((t, b) => t + b.amount, 0)}
            filter="upcoming"
            tone="brand"
            loading={billsQ.isLoading}
          />
          <BillStatCard
            label="Due this week"
            count={billStats.dueThisWeek.length}
            total={billStats.totalNext7}
            filter="upcoming"
            tone="expense"
            loading={billsQ.isLoading}
          />
          <BillStatCard
            label="Due this month"
            count={billStats.dueThisMonth.length}
            total={billStats.totalDueThisMonth}
            filter="upcoming"
            tone="expense"
            loading={billsQ.isLoading}
          />
          <BillStatCard
            label="Overdue"
            count={billStats.overdue.length}
            total={billStats.totalOverdue}
            filter="overdue"
            tone="expense"
            loading={billsQ.isLoading}
          />
          <BillStatCard
            label="Paid this month"
            count={billStats.paidThisMonth.length}
            total={billStats.totalPaidThisMonth}
            filter="paid"
            tone="income"
            loading={billsQ.isLoading}
          />
        </section>

        {/* Financial Health */}
        <section>
          <HealthScoreCard health={health} />
        </section>

        {/* Charts grid */}
        <section className="grid gap-4 lg:grid-cols-3">

          <ChartCard title="Income vs Expense" subtitle="Last 14 days" className="lg:col-span-2">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData.days} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="income" stroke="var(--income)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="expense" stroke="var(--expense)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Spending Categories" subtitle="This month">
            {loading ? (
              <ChartSkeleton />
            ) : chartData.pie.length === 0 ? (
              <EmptyState icon={<PieChart className="h-6 w-6" />} title="No spending yet" hint="Log an expense to see breakdown." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={chartData.pie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {chartData.pie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {chartData.pie.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {chartData.pie.slice(0, 6).map((s, i) => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground">{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Monthly Cash Flow" subtitle="Last 6 months" className="lg:col-span-2">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData.months} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="income" fill="var(--income)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="var(--expense)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Weekly Spending" subtitle="Last 8 weeks">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData.weeks} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--expense)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--expense)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="expense" stroke="var(--expense)" strokeWidth={2.5} fill="url(#expGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Savings Trend" subtitle="Cumulative · 12 weeks" className="lg:col-span-3">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData.savingsSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--income)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--income)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={fmtShort} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="savings" stroke="var(--income)" strokeWidth={2.5} fill="url(#savGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </section>

        {/* Widgets grid */}
        <section className="grid gap-4 lg:grid-cols-3">
          {/* Recent transactions */}
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">Recent Transactions</h2>
                <p className="text-xs text-muted-foreground">{entries.length} total entries</p>
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {loading ? (
              <ListSkeleton />
            ) : entries.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-6 w-6" />}
                title="No entries yet"
                hint="Tap the + button to log your first cash move."
              />
            ) : (
              <ul className="divide-y divide-border">
                {entries.slice(0, 8).map((e) => (
                  <li key={e.id} className="group flex items-center gap-3 py-3 animate-fade-in">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        e.type === "income" ? "bg-income/12 text-income" : "bg-expense/12 text-expense"
                      }`}
                    >
                      {e.type === "income" ? (
                        <ArrowDownRight className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {e.description || (e.type === "income" ? "Income" : "Expense")}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{e.entry_date}</span>
                        {e.category && (
                          <>
                            <span>·</span>
                            <span className="rounded-full bg-muted px-1.5 py-0.5">{e.category}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${e.type === "income" ? "text-income" : "text-expense"}`}>
                      {e.type === "income" ? "+" : "−"}
                      {fmt(e.amount)}
                    </div>
                    <button
                      onClick={() => del.mutate(e.id)}
                      className="rounded-lg p-2 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI Insights */}
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/50 text-accent-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">AI Insights</h2>
                <p className="text-xs text-muted-foreground">Personalised tips</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {insights.length === 0 ? (
                <InsightRow text="Log a few entries to unlock personalised insights." />
              ) : (
                insights.map((ins, i) => <InsightRow key={i} text={ins.text} />)
              )}
            </div>

          </div>

          {/* Upcoming bills */}
          <WidgetCard title="Upcoming Bills" icon={<Receipt className="h-4 w-4" />}>
            {billsQ.isLoading ? (
              <ListSkeleton />
            ) : [...billStats.overdue, ...billStats.upcoming].length === 0 ? (
              <div className="space-y-3">
                <EmptyState
                  icon={<Receipt className="h-6 w-6" />}
                  title="No upcoming bills"
                  hint="Add your recurring bills to see them tracked here."
                  compact
                />
                <Link
                  to="/bills"
                  search={{ filter: "all" as const, open: undefined }}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Bill
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                <ul className="space-y-1.5">
                  {[...billStats.overdue, ...billStats.upcoming].slice(0, 5).map((b) => {
                    const st = effectiveStatus(b);
                    return (
                      <li key={b.id}>
                        <Link
                          to="/bills"
                          search={{ filter: "all" as const, open: b.id }}
                          className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-muted/60"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{b.name}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span>{b.due_date}</span>
                              {b.category && (
                                <>
                                  <span>·</span>
                                  <span className="rounded-full bg-muted px-1.5 py-0.5">{b.category}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">{fmt(b.amount)}</div>
                            <span
                              className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize ${statusTone(st)}`}
                            >
                              {st}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  to="/bills"
                  search={{ filter: "all" as const, open: undefined }}
                  className="block rounded-xl border border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  View All
                </Link>
              </div>
            )}
          </WidgetCard>

          {/* Budget progress */}
          <WidgetCard title="Budget Progress" icon={<Target className="h-4 w-4" />}>
            {chartData.pie.length === 0 ? (
              <EmptyState icon={<Target className="h-6 w-6" />} title="No budgets yet" hint="Track expenses to build budgets." compact />
            ) : (
              <div className="space-y-3">
                {chartData.pie.slice(0, 4).map((c, i) => {
                  const cap = Math.max(500, Math.round((c.value * 1.25) / 100) * 100);
                  const pct = Math.min(100, (c.value / cap) * 100);
                  return (
                    <div key={c.name}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">
                          {fmt(c.value)} / {fmt(cap)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WidgetCard>

          {/* Savings goals */}
          <WidgetCard title="Savings Goals" icon={<PiggyBank className="h-4 w-4" />}>
            <div className="space-y-3">
              <GoalRow name="Emergency Fund" current={stats.savings} target={10000} />
              <GoalRow name="90-Day Target" current={stats.balance} target={5000} />
            </div>
          </WidgetCard>
        </section>
      </main>

      {/* Floating Add Button */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full text-white shadow-lift transition hover:scale-105 active:scale-95"
        style={{ background: "var(--gradient-money)" }}
        aria-label="Add transaction"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {/* Add Sheet */}
      {showAdd && (
        <AddSheet
          onClose={() => setShowAdd(false)}
          onAdd={(p) => add.mutate(p)}
          busy={add.isPending}
        />
      )}
    </div>
  );
}

/* ------- sub components ------- */

function SummaryCard({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "income" | "expense" | "brand";
  loading?: boolean;
}) {
  const toneClass =
    tone === "income"
      ? "bg-income/12 text-income"
      : tone === "expense"
        ? "bg-expense/12 text-expense"
        : "bg-primary/12 text-primary";
  return (
    <div className="group rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-3 font-display text-xl font-semibold tracking-tight sm:text-2xl">
        {loading ? <Skeleton className="h-7 w-24" /> : value}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-border bg-card p-5 shadow-soft ${className}`}>
      <div className="mb-3">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function WidgetCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <h3 className="font-display text-base font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InsightRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-2.5 text-xs">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="leading-relaxed">{text}</span>
    </div>
  );
}

function GoalRow({ name, current, target }: { name: string; current: number; target: number }) {
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">
          {fmt(Math.max(0, current))} / {fmt(target)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: "var(--gradient-money)" }}
        />
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function ChartSkeleton() {
  return (
    <div className="flex h-[240px] flex-col justify-end gap-2">
      <div className="flex h-full items-end gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-lg bg-muted"
            style={{ height: `${30 + ((i * 17) % 60)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 text-center ${compact ? "px-4 py-6" : "px-4 py-10"}`}>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      {hint && <div className="mt-1 max-w-[220px] text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lift">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="capitalize text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function AddSheet({
  onClose,
  onAdd,
  busy,
}: {
  onClose: () => void;
  onAdd: (p: {
    type: "income" | "expense";
    amount: number;
    description: string;
    category: string;
    entry_date: string;
  }) => void;
  busy: boolean;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");
  const [date, setDate] = useState(isoDate(new Date()));

  const cats = type === "income" ? INCOME_CATEGORIES : [...EXPENSE_CATEGORIES, SAVINGS_CATEGORY];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseFloat(amount);
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    onAdd({ type, amount: n, description: description.trim(), category, entry_date: date });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-fade-in sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-lift animate-scale-in sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Add Transaction</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="inline-flex w-full rounded-full bg-muted p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setType("expense");
                setCategory("");
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                type === "expense" ? "bg-expense text-expense-foreground shadow-soft" : "text-muted-foreground"
              }`}
            >
              Money Out
            </button>
            <button
              type="button"
              onClick={() => {
                setType("income");
                setCategory("");
              }}
              className={`flex-1 rounded-full px-3 py-2 transition ${
                type === "income" ? "bg-income text-income-foreground shadow-soft" : "text-muted-foreground"
              }`}
            >
              Money In
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                R
              </span>
              <input
                type="number"
                inputMode="decimal"
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
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
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
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was it?"
              maxLength={120}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:opacity-95 disabled:opacity-60"
            style={{ background: "var(--gradient-money)" }}
          >
            {busy ? "Saving…" : "Add Transaction"}
          </button>
        </form>
      </div>
    </div>
  );
}

function BillStatCard({
  label,
  count,
  total,
  filter,
  tone,
  loading,
}: {
  label: string;
  count: number;
  total: number;
  filter: "upcoming" | "overdue" | "paid";
  tone: "income" | "expense" | "brand";
  loading?: boolean;
}) {
  const toneClass =
    tone === "income"
      ? "bg-income/10 text-income"
      : tone === "expense"
        ? "bg-expense/10 text-expense"
        : "bg-accent/50 text-accent-foreground";
  return (
    <Link
      to="/bills"
      search={{ filter, open: undefined }}
      className="rounded-2xl border border-border bg-card p-4 shadow-soft transition hover:shadow-lift"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`}>
          <Receipt className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <>
          <div className="mt-3 font-display text-xl font-semibold tracking-tight sm:text-2xl">{fmt(total)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {count} bill{count === 1 ? "" : "s"}
          </div>
        </>
      )}
    </Link>
  );
}
