This is a large scope (12 major feature areas). To keep quality high and avoid breaking the existing dashboard, I'll ship it in phases. Please confirm the order — or tell me which phase to start with — before I begin.

## Phase 1 — Data foundation (schema + shared infra)
New tables + columns needed by almost every later phase. Existing `cash_entries` stays; new columns are additive/nullable so nothing breaks.

- `accounts` (name, type: cash/savings/cheque/credit/business/wallet, opening_balance, currency, archived)
- `cash_entries` add: `account_id`, `merchant`, `payment_method`, `reference`, `tags text[]`, `notes`, `receipt_url`, `location`, `status`, `archived_at`, `recurring_id`
- `transfers` (from_account, to_account, amount, date)
- `recurring_rules` (template + frequency + next_run)
- `bills`, `notifications`, `profiles` (display_name, avatar_url, currency, locale, theme, monthly_goal)
- `receipts` storage bucket (private, per-user RLS)
- RLS + GRANTs on every new table

## Phase 2 — Accounts + Advanced transactions
- Accounts CRUD page + account switcher on dashboard
- Transfers between accounts
- Transaction detail sheet: all new fields, edit/delete/duplicate/archive/restore
- Transactions list page: search, sort, bulk select, advanced filters (date presets, category, merchant, method, account)
- Receipt upload (image) → storage bucket

## Phase 3 — Calendar + Recurring + Bills
- `/calendar` route with month grid, per-day drill-in
- Recurring rules UI + background materializer (server fn on load)
- Upcoming bills tied to real bill records (widget already exists — swap data source)

## Phase 4 — Notifications + Profile
- Notification center (bell in header, `/notifications` page, unread badge)
- Server-side triggers: budget exceeded, large expense, upcoming bill, milestone
- `/profile` settings page

## Phase 5 — Reports + Financial Health Score
- `/reports` with period selector, export PDF/CSV/Excel/Print
- Health score card on dashboard (0–100, derived from savings rate, budget usage, cashflow, bills paid)

## Phase 6 — AI upgrade + Global search + Polish
- Upgrade AI insights widget with real computed insights (spend deltas, category share, projection, health tips) via Lovable AI
- Global command-palette search (Cmd/Ctrl-K)
- Animation, skeleton, empty-state, a11y pass

---

**Which phase should I start with?** I recommend Phase 1 first (it's a migration you'll need to approve), then Phase 2. If you'd rather I jump straight to a specific feature (e.g. "just do Calendar" or "just do Reports"), tell me which and I'll do only that.
