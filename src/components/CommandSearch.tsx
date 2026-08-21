import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, Wallet, ArrowUpRight, Bell, Settings, Calendar as CalIcon, LayoutDashboard, Receipt } from "lucide-react";
import { fmt } from "@/lib/finance";

type Hit =
  | { kind: "entry"; id: string; title: string; sub: string; amount: number; type: "income" | "expense" }
  | { kind: "account"; id: string; title: string; sub: string }
  | { kind: "bill"; id: string; title: string; sub: string; amount: number }
  | { kind: "nav"; id: string; title: string; sub: string; to: string; icon: React.ReactNode; keywords?: string };

const NAV: Hit[] = [
  { kind: "nav", id: "n-dash", title: "Dashboard", sub: "Overview & insights", to: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { kind: "nav", id: "n-tx", title: "Transactions", sub: "Search & manage entries", to: "/transactions", icon: <ArrowUpRight className="h-4 w-4" /> },
  { kind: "nav", id: "n-acc", title: "Accounts", sub: "Balances & transfers", to: "/accounts", icon: <Wallet className="h-4 w-4" /> },
  { kind: "nav", id: "n-bills", title: "Bills", sub: "Open Bills and manage upcoming, paid and overdue bills.", to: "/bills", icon: <Receipt className="h-4 w-4" />, keywords: "bills bill upcoming bills paid overdue payments" },
  { kind: "nav", id: "n-cal", title: "Calendar", sub: "Cash flow by day", to: "/calendar", icon: <CalIcon className="h-4 w-4" /> },
  { kind: "nav", id: "n-notif", title: "Notifications", sub: "Alerts & reminders", to: "/notifications", icon: <Bell className="h-4 w-4" /> },
  { kind: "nav", id: "n-set", title: "Settings", sub: "Profile & preferences", to: "/settings", icon: <Settings className="h-4 w-4" /> },
];

export function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else {
      setQ("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) {
      setHits(NAV);
      return;
    }
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [entries, accounts, bills] = await Promise.all([
        supabase
          .from("cash_entries")
          .select("id,description,merchant,category,amount,type,entry_date")
          .or(`description.ilike.${like},merchant.ilike.${like},category.ilike.${like},reference.ilike.${like}`)
          .is("archived_at", null)
          .limit(6),
        supabase.from("accounts").select("id,name,type").ilike("name", like).limit(4),
        supabase.from("bills").select("id,name,amount,due_date").ilike("name", like).limit(4),
      ]);
      const results: Hit[] = [];
      for (const e of entries.data ?? [])
        results.push({
          kind: "entry",
          id: e.id,
          title: e.description || e.merchant || e.category || "Entry",
          sub: `${e.entry_date} · ${e.category ?? "—"}`,
          amount: Number(e.amount),
          type: e.type as "income" | "expense",
        });
      for (const a of accounts.data ?? []) results.push({ kind: "account", id: a.id, title: a.name, sub: `Account · ${a.type}` });
      for (const b of bills.data ?? [])
        results.push({ kind: "bill", id: b.id, title: b.name, sub: `Bill · due ${b.due_date}`, amount: Number(b.amount) });
      const tlc = term.toLowerCase();
      const navHits = NAV.filter(
        (n) => n.title.toLowerCase().includes(tlc) || n.sub.toLowerCase().includes(tlc) || n.keywords?.toLowerCase().includes(tlc),
      );
      setHits([...navHits, ...results]);
      setActive(0);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(h: Hit) {
    onClose();
    if (h.kind === "nav") {
      if (h.id === "n-bills") navigate({ to: "/bills", search: { filter: "all" as const, open: undefined } });
      else navigate({ to: h.to });
    } else if (h.kind === "entry") navigate({ to: "/transactions", search: { q: h.title } as any });
    else if (h.kind === "account") navigate({ to: "/accounts" });
    else if (h.kind === "bill") navigate({ to: "/calendar" });
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[10vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entries, accounts, bills, pages…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
              else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              else if (e.key === "Enter" && hits[active]) go(hits[active]);
              else if (e.key === "Escape") onClose();
            }}
          />
          <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">ESC</kbd>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted sm:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {hits.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No results.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.kind + h.id}
                onClick={() => go(h)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                  i === active ? "bg-muted/60" : "hover:bg-muted/40"
                }`}
              >
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                  {h.kind === "nav" ? h.icon : h.kind === "entry" ? <ArrowUpRight className="h-4 w-4" /> : h.kind === "account" ? <Wallet className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{h.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{h.sub}</div>
                </div>
                {"amount" in h && (
                  <div className={`text-sm font-medium ${h.kind === "entry" && h.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
                    {fmt(h.amount)}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="mr-3">↑↓ navigate</span>
          <span className="mr-3">↵ open</span>
          <span>⌘K to toggle</span>
        </div>
      </div>
    </div>
  );
}
