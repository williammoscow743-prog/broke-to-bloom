import { fmt } from "./finance";

export type EntryLite = {
  entry_date: string;
  type: "income" | "expense";
  category: string | null;
  amount: number;
};

export type HealthBreakdown = {
  score: number;
  tier: "Building" | "Growing" | "Strong" | "Excellent";
  parts: { label: string; weight: number; score: number; hint: string }[];
};

export function computeHealthScore(entries: EntryLite[], dayNumber: number): HealthBreakdown {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEntries = entries.filter((e) => new Date(e.entry_date) >= monthStart);
  const mIn = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const mOut = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);

  // Savings rate (30)
  const savingsRate = mIn > 0 ? Math.max(0, (mIn - mOut) / mIn) : 0;
  const savingsScore = Math.min(100, savingsRate * 200); // 50% rate = 100

  // Consistency (25) — days with entries in last 30
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const days = new Set(entries.filter((e) => new Date(e.entry_date) >= last30).map((e) => e.entry_date));
  const consistency = Math.min(100, (days.size / 20) * 100);

  // Budget adherence (20) — expense/income
  const spendRatio = mIn > 0 ? mOut / mIn : 1;
  const budget = spendRatio < 0.6 ? 100 : spendRatio < 0.8 ? 80 : spendRatio < 1 ? 50 : 20;

  // Emergency buffer (15)
  const savings = entries
    .filter((e) => e.category === "Savings")
    .reduce((s, e) => s + (e.type === "expense" ? e.amount : -e.amount), 0);
  const buffer = mOut > 0 ? Math.min(100, (Math.max(0, savings) / (mOut * 3)) * 100) : 40;

  // Momentum (10) — journey days
  const momentum = Math.min(100, (dayNumber / 90) * 100);

  const parts = [
    { label: "Savings rate", weight: 30, score: Math.round(savingsScore), hint: `${Math.round(savingsRate * 100)}% of income saved this month` },
    { label: "Consistency", weight: 25, score: Math.round(consistency), hint: `${days.size} active days in the last 30` },
    { label: "Spend control", weight: 20, score: budget, hint: `Spending ${Math.round(spendRatio * 100)}% of income` },
    { label: "Emergency buffer", weight: 15, score: Math.round(buffer), hint: `${fmt(Math.max(0, savings))} saved` },
    { label: "Journey momentum", weight: 10, score: Math.round(momentum), hint: `Day ${dayNumber} of 90` },
  ];
  const score = Math.round(parts.reduce((s, p) => s + (p.score * p.weight) / 100, 0));
  const tier: HealthBreakdown["tier"] =
    score >= 85 ? "Excellent" : score >= 70 ? "Strong" : score >= 50 ? "Growing" : "Building";
  return { score, tier, parts };
}

export function computeInsights(entries: EntryLite[]): { icon: "up" | "down" | "tip" | "warn"; text: string }[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = monthStart;

  const inRange = (d: string, a: Date, b: Date) => {
    const t = new Date(d).getTime();
    return t >= a.getTime() && t < b.getTime();
  };
  const sum = (arr: EntryLite[], type: "income" | "expense") =>
    arr.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0);

  const monthE = entries.filter((e) => new Date(e.entry_date) >= monthStart);
  const prevE = entries.filter((e) => inRange(e.entry_date, prevStart, prevEnd));
  const mIn = sum(monthE, "income");
  const mOut = sum(monthE, "expense");
  const pOut = sum(prevE, "expense");

  const out: { icon: "up" | "down" | "tip" | "warn"; text: string }[] = [];

  if (mIn > 0) {
    const rate = Math.round((1 - mOut / mIn) * 100);
    if (rate >= 20) out.push({ icon: "up", text: `You're saving ~${rate}% of income this month — well above the 10% baseline.` });
    else if (rate >= 0) out.push({ icon: "tip", text: `Saving ${rate}% this month. Aim for 20% by trimming your top category.` });
    else out.push({ icon: "warn", text: `Spending exceeds income by ${fmt(mOut - mIn)} this month — pause discretionary spend.` });
  } else {
    out.push({ icon: "tip", text: "Log at least one income entry to unlock savings-rate insight." });
  }

  if (pOut > 0) {
    const diff = ((mOut - pOut) / pOut) * 100;
    if (Math.abs(diff) >= 5) {
      out.push({
        icon: diff < 0 ? "up" : "warn",
        text: `Expenses are ${Math.abs(Math.round(diff))}% ${diff < 0 ? "lower" : "higher"} than last month (${fmt(pOut)} → ${fmt(mOut)}).`,
      });
    }
  }

  // Top category
  const catMap = new Map<string, number>();
  for (const e of monthE) if (e.type === "expense") catMap.set(e.category || "Other", (catMap.get(e.category || "Other") ?? 0) + e.amount);
  const top = [...catMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) out.push({ icon: "tip", text: `Top spend this month: ${top[0]} (${fmt(top[1])}). A weekly cap of ${fmt(Math.round(top[1] / 4))} would rein it in.` });

  // Streak
  const days = new Set(entries.map((e) => e.entry_date));
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  if (streak >= 3) out.push({ icon: "up", text: `${streak}-day tracking streak — consistency compounds.` });

  return out.slice(0, 5);
}
