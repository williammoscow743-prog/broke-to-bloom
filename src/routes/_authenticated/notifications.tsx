import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Bell, CheckCheck, ChevronLeft, Info, Trash2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Notif = {
  id: string;
  kind: string | null;
  title: string;
  body: string | null;
  severity: string | null;
  read_at: string | null;
  created_at: string;
};

function NotificationsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications-page", user.id],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,kind,title,body,severity,read_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Notif[];
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").delete().not("id", "is", null);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  const del = useMutation({
    mutationFn: async (id: string) => await supabase.from("notifications").delete().eq("id", id),
    onSuccess: () => qc.invalidateQueries(),
  });

  const list = q.data ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate({ to: "/dashboard" })} className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="font-display text-base font-semibold leading-none">Notifications</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{list.filter((n) => !n.read_at).length} unread</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => markAll.mutate()} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
            <button onClick={() => { if (confirm("Clear all notifications?")) clearAll.mutate(); }} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        {list.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/60 px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Bell className="h-6 w-6" />
            </div>
            <div className="mt-4 font-display text-lg font-semibold">Nothing to catch up on</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Bills, budgets, savings milestones and insights will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
            {list.map((n) => (
              <li key={n.id} className={`group flex items-start gap-3 px-4 py-4 ${!n.read_at ? "bg-primary/[0.04]" : ""}`}>
                <Sev severity={n.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-medium">{n.title}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                </div>
                <button onClick={() => del.mutate(n.id)} className="opacity-0 transition group-hover:opacity-100" aria-label="Delete">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function Sev({ severity }: { severity: string | null }) {
  if (severity === "warning" || severity === "high") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  if (severity === "success") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  return <Info className="h-4 w-4 text-sky-500" />;
}
