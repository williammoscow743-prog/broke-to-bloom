import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronLeft, LogOut, Moon, Save, Sun, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  currency: string | null;
  locale: string | null;
  theme: string | null;
  monthly_goal: number | null;
  notify_prefs: { bills?: boolean; budgets?: boolean; insights?: boolean; savings?: boolean } | null;
};

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async (): Promise<Profile> => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (data) return data as Profile;
      const { data: created, error } = await supabase
        .from("profiles")
        .insert({ user_id: user.id, currency: "ZAR", locale: "en-ZA", theme: "system" })
        .select()
        .single();
      if (error) throw error;
      return created as Profile;
    },
  });

  const [form, setForm] = useState<Partial<Profile>>({});
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: form.display_name ?? null,
          currency: form.currency ?? "ZAR",
          locale: form.locale ?? "en-ZA",
          theme: form.theme ?? "system",
          monthly_goal: form.monthly_goal ?? null,
          notify_prefs: form.notify_prefs ?? {},
        })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["profile", user.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function applyTheme(t: string) {
    setForm((f) => ({ ...f, theme: t }));
    if (t === "dark") document.documentElement.classList.add("dark");
    else if (t === "light") document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", t === "dark" ? "dark" : "light");
  }

  const prefs = form.notify_prefs ?? {};

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ to: "/dashboard" })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="font-display text-base font-semibold leading-none">Settings</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Profile & preferences</div>
            </div>
          </div>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
            <Save className="h-3.5 w-3.5" /> {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pb-20 pt-6 sm:px-6">
        <Card title="Profile">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted text-muted-foreground">
              <User className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">{user.email}</div>
              <div className="text-xs text-muted-foreground">Signed in</div>
            </div>
          </div>
          <Field label="Display name">
            <input
              value={form.display_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Your name"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
            />
          </Field>
          <Field label="Monthly savings goal">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R</span>
              <input
                type="number"
                min="0"
                step="100"
                value={form.monthly_goal ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, monthly_goal: e.target.value ? Number(e.target.value) : null }))}
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-8 pr-3 text-sm focus:border-ring focus:outline-none"
              />
            </div>
          </Field>
        </Card>

        <Card title="Appearance">
          <div className="flex gap-2">
            {[
              { v: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
              { v: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
              { v: "system", label: "System", icon: null },
            ].map((t) => (
              <button
                key={t.v}
                onClick={() => applyTheme(t.v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition ${
                  form.theme === t.v ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Regional">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Currency">
              <select
                value={form.currency ?? "ZAR"}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
              >
                {["ZAR","USD","EUR","GBP","NGN","KES","AUD","CAD"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Locale">
              <select
                value={form.locale ?? "en-ZA"}
                onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:border-ring focus:outline-none"
              >
                {["en-ZA","en-US","en-GB","en-NG","en-KE"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Notifications">
          {[
            { k: "bills", label: "Upcoming bill reminders" },
            { k: "budgets", label: "Budget threshold warnings" },
            { k: "savings", label: "Savings goal milestones" },
            { k: "insights", label: "Weekly AI insights" },
          ].map((n) => {
            const on = (prefs as any)[n.k] !== false;
            return (
              <label key={n.k} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm">
                <span>{n.label}</span>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, notify_prefs: { ...(f.notify_prefs ?? {}), [n.k]: !on } }))
                  }
                  className={`relative h-5 w-9 rounded-full transition ${on ? "bg-primary" : "bg-muted"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${on ? "left-4" : "left-0.5"}`} />
                </button>
              </label>
            );
          })}
        </Card>

        <Card title="Account">
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </Card>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h2 className="mb-4 font-display text-base font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
