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
      <div className="fixed right-4 top-3 z-40 flex items-center gap-1.5 sm:right-6">
        <button
          onClick={() => setOpen(true)}
          className="hidden items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-2 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur transition hover:text-foreground sm:inline-flex"
          aria-label="Search"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="rounded border border-border bg-background px-1 py-0 text-[10px]">⌘K</kbd>
        </button>
        <button
          onClick={() => setOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-soft backdrop-blur sm:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <NotificationBell userId={userId} />
        <Link
          to="/settings"
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-soft backdrop-blur transition hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
      <CommandSearch open={open} onClose={() => setOpen(false)} />
    </>
  );
}
