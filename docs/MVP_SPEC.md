# MVP Spec: Unified Ads Reporting (Phase 1)

Status: draft · Owner: Jonathan · Last updated: 2026-10-10

## 1. Goal

One dashboard where an **agency** sees ad performance for **many brands**, starting with
**Meta (Facebook + Instagram)**. Read-only: no changes are sent back to the ad platforms.

Success = Jonathan can log in, see yesterday's spend / results for his own Meta ad account,
and the numbers match Meta Ads Manager.

## 2. Users

| Role | Can do |
| --- | --- |
| Agency owner | Add brands, connect ad accounts, invite members, see everything in the agency |
| Agency member | See dashboards for all brands in the agency |

One login can belong to more than one agency (later). MVP: one agency per user.

## 3. In scope

1. Email login (Supabase Auth, magic link).
2. Agency → Brands → Ad accounts structure.
3. Connect **one Meta ad account** per brand (MVP: token pasted by admin; OAuth later).
4. **Daily sync** of campaign-level metrics for the last 7 days (re-pulls recent days, because
   Meta keeps updating conversions for a few days).
5. Dashboard per brand:
   - KPI tiles: Spend, Impressions, Clicks, CTR, CPC, CPM, Purchases, Revenue, ROAS
   - Daily spend line chart (last 30 days)
   - Campaign table, sortable
6. "Last synced at" and sync error shown per ad account.

## 4. Out of scope (later phases)

- TikTok and Shopee connectors (Phase 1b, after Meta works)
- Any write action (pause, budget) — Phase 3
- AI insights — Phase 2
- WhatsApp / email reports — Phase 2
- Billing, multi-agency per user, white-label

## 5. Metrics definitions

All money stored in the ad account's currency (IDR expected). Dates are in the ad account's time zone.

| Metric | Definition |
| --- | --- |
| Spend | Amount spent, as reported by the platform |
| Impressions | Times ads were shown |
| Clicks | Link clicks (Meta `inline_link_clicks`) |
| CTR | Clicks ÷ Impressions |
| CPC | Spend ÷ Clicks |
| CPM | Spend ÷ Impressions × 1,000 |
| Purchases | Meta `actions` of type `purchase` (0 if not tracked) |
| Revenue (GMV) | Meta `action_values` of type `purchase` |
| ROAS | Revenue ÷ Spend |

Ratios are computed at read time from summed totals, never averaged from daily ratios.

## 6. Architecture

| Piece | Service | Role |
| --- | --- | --- |
| Database + login | Supabase (free) | Postgres tables, Row Level Security, Auth |
| Daily sync | GitHub Actions (scheduled) | Runs `sync/` once a day, writes to Supabase |
| Dashboard | Static web app (Cloudflare Pages) | Reads from Supabase with the user's login |

Security rules:
- Platform access tokens live in `connections`, readable **only** by the sync job (service role).
  The dashboard can never read them.
- Every dashboard query is filtered by Row Level Security: users see only their agency's data.

## 7. Open items

- [ ] Jonathan: Meta Business Portfolio + ad account (IDR, Asia/Jakarta) + small test campaign
- [ ] Jonathan: create Supabase project, share URL (keys go into GitHub Secrets, never chat)
- [ ] Decide Meta Graph API version at build time (latest stable)
- [ ] Later: PT/CV for Meta Business Verification before connecting other brands

## Phase 2a (added 2026-10-22)

- **Plan budget:** industry advice + cost simulation across Meta, TikTok, Shopee. Ranges, never promises; sources listed in the app.
- **Create campaign (Meta):** form → estimate → draft → review → publish as PAUSED. Dummy connector until Meta write access is wired server-side.
- Industries in v1: beauty, fashion, food, automotive, health, electronics, home.
- Open: replace assumption figures (Shopee cost per click, order values, ROAS spread) with real client data.
