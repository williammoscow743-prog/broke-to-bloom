import type { HealthBreakdown } from "@/lib/insights";
import { Activity } from "lucide-react";

export function HealthScoreCard({ health }: { health: HealthBreakdown }) {
  const { score, tier, parts } = health;
  const hue = score >= 70 ? 150 : score >= 50 ? 60 : 25;
  const ring = `conic-gradient(oklch(0.65 0.18 ${hue}) ${score * 3.6}deg, hsl(var(--muted, 220 14% 90%)) 0deg)`;
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/50 text-accent-foreground">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Financial Health</h2>
          <p className="text-xs text-muted-foreground">Weighted composite of 5 signals</p>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: ring }}>
          <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-card">
            <div className="text-center">
              <div className="font-display text-2xl font-semibold leading-none">{score}</div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">{tier}</div>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {parts.map((p) => (
            <div key={p.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium">{p.label}</span>
                <span className="text-muted-foreground">{p.score}/100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${p.score}%`,
                    background: `oklch(0.65 0.16 ${p.score >= 70 ? 150 : p.score >= 50 ? 60 : 25})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
