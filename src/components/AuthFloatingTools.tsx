import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, Settings } from "lucide-react";
import { CommandSearch } from "./CommandSearch";
import { NotificationBell } from "./NotificationBell";

export function AuthFloatingTools({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="fixed left-4 bottom-6 z-40 flex items-center gap-2 rounded-2xl border border-border bg-card/90 p-1.5 shadow-lift backdrop-blur-xl sm:left-6 sm:gap-2.5">
        <button
          onClick={() => setOpen(true)}
          className="hidden items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground shadow-soft transition hover:text-foreground sm:inline-flex"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="rounded border border-border bg-muted px-1 py-0 text-[10px]">⌘K</kbd>
        </button>
        <button
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-muted-foreground shadow-soft transition hover:text-foreground sm:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <div className="h-6 w-px bg-border hidden sm:block" />
        <NotificationBell userId={userId} />
        <Link
          to="/settings"
          className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-background text-muted-foreground shadow-soft transition hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
      <CommandSearch open={open} onClose={() => setOpen(false)} />
    </>
  );
}
