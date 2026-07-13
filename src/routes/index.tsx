import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, TrendingUp, Wallet, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg" style={{ background: "var(--gradient-money)" }} />
          <span className="font-display text-lg font-semibold">90 Days</span>
        </div>
        <Link
          to="/auth"
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Sign in
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-12 pb-20 text-center sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/50 px-3 py-1 text-xs font-medium text-accent-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Broke → Cash Flow in 90 days
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] font-semibold sm:text-6xl md:text-7xl">
            Track every dollar.<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-hero)" }}
            >
              Build real cash flow.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            A dead-simple 90-day money system. Log what comes in, log what goes out, watch your daily cash flow turn positive.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-semibold text-primary-foreground shadow-lift transition hover:opacity-95"
              style={{ background: "var(--gradient-hero)" }}
            >
              Start your 90 days <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-muted-foreground">Free · takes 30 seconds</span>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
          {[
            { icon: Wallet, title: "Daily entries", body: "Log income and expenses in seconds. No categories to overthink." },
            { icon: TrendingUp, title: "Live cash flow", body: "See your net every day. Green means you're building. Red means adjust." },
            { icon: Target, title: "90-day arc", body: "One focused season. Small daily wins compound into real momentum." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
