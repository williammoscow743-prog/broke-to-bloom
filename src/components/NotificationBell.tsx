import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Bell, CheckCheck, X, AlertCircle, Info, TrendingUp } from "lucide-react";
import { useState } from "react";

type Notif = {
  id: string;
  kind: string | null;
  title: string;
  body: string | null;
  severity: string | null;
  read_at: string | null;
  link: string | null;
  created_at: string;
};

export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,kind,title,body,severity,read_at,link,created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Notif[];
    },
    refetchInterval: 60_000,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", userId] }),
  });

  const list = q.data ?? [];
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-lift animate-in slide-in-from-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="font-display text-base font-semibold">Notifications</div>
                <div className="text-[11px] text-muted-foreground">{unread} unread</div>
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={() => markAll.mutate()}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Mark all
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="grid place-items-center px-6 py-20 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="mt-3 text-sm font-medium">You're all caught up</div>
                  <p className="mt-1 text-xs text-muted-foreground">Insights and reminders will appear here.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((n) => (
                    <li key={n.id} className={`group relative px-4 py-3 ${!n.read_at ? "bg-primary/[0.04]" : ""}`}>
                      <div className="flex items-start gap-3">
                        <SeverityIcon severity={n.severity} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="truncate text-sm font-medium">{n.title}</div>
                            <div className="shrink-0 text-[10px] text-muted-foreground">
                              {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </div>
                          </div>
                          {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                        </div>
                        <button
                          onClick={() => del.mutate(n.id)}
                          className="opacity-0 transition group-hover:opacity-100"
                          aria-label="Dismiss"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SeverityIcon({ severity }: { severity: string | null }) {
  const cls = "h-4 w-4";
  if (severity === "warning" || severity === "high") return <AlertCircle className={`${cls} text-amber-500`} />;
  if (severity === "success") return <TrendingUp className={`${cls} text-emerald-500`} />;
  return <Info className={`${cls} text-sky-500`} />;
}
