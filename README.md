# Ads Internal Test

Unified ads reporting for agencies managing many brands. Phase 1: **Meta (Facebook + Instagram), read-only**.
TikTok and Shopee come after Meta works. Full scope: [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md).

## How it fits together

```
Meta Marketing API ──► sync/ (GitHub Actions, daily 06:17 WIB) ──► Supabase (Postgres + Auth) ──► Dashboard (web/, coming next)
```

| Folder | What it is |
| --- | --- |
| `docs/` | Spec and decisions |
| `supabase/migrations/` | Database tables and access rules |
| `sync/` | Job that pulls ad data from Meta and saves it |
| `.github/workflows/` | Schedule that runs the sync every day |
| `web/` | Dashboard (not built yet) |

## Setup checklist

1. **Supabase**: create a free project at supabase.com → SQL Editor → paste and run
   `supabase/migrations/0001_init.sql`.
2. **GitHub secrets** (repo → Settings → Secrets and variables → Actions):
   - Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - Variables: `META_API_VERSION` (latest stable Graph API version, e.g. `v24.0`)
3. **Meta**: ad account in IDR, time zone Asia/Jakarta, with some campaign history.

Never paste keys or tokens into chat or commit them. They belong in GitHub Secrets or a local `.env`.

## Try the Meta pull locally (no database needed)

```bash
npm install
cp .env.example .env   # fill META_TOKEN, META_AD_ACCOUNT, META_API_VERSION
node --env-file=.env sync/index.mjs --dry-run
```

It prints the last 7 days per campaign and a spend / revenue / ROAS total to compare with Ads Manager.

## Tests

```bash
npm test
```

## Dashboard (`web/`)

Plain HTML/JS, no framework. Data comes from Supabase with the user's own login, filtered by row-level security.

**Preview without any setup** (fictional demo brands only):

```bash
npm run preview   # then open http://localhost:4173
```

**Deploy on Cloudflare Pages:** connect this repo, then
- Build command: `node scripts/build-web.mjs`
- Build output directory: `dist`
- Environment variables: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (the publishable / anon key, never the secret key)

In Supabase → Authentication → URL Configuration, set **Site URL** to your Pages address (e.g. `https://ads-internal-test.pages.dev`).

## Demo data

The **Demo data: load or remove** workflow adds four fictional brands across Meta, TikTok and Shopee
(`shared/mock.mjs`). They are marked **Demo** everywhere and refresh with the daily sync.
Run it again with `remove` to delete them; real accounts are never touched.

## How connectors work

`sync/core.mjs` picks a connector per ad account. Every connector returns the same rows
(campaign, date, spend, impressions, clicks, purchases, revenue):

| Account | Connector |
| --- | --- |
| `demo_*` ids | `shared/mock.mjs` (fictional data) |
| Meta | `sync/meta.mjs` (Marketing API) |
| TikTok, Shopee | Not built yet: needs platform API approval |

## Plan budget and Create campaign (Phase 2a)

**Plan budget** (`web/plan.js`, `shared/benchmarks.mjs`): pick an industry and monthly budget, get a
recommended split across TikTok, Shopee and Meta with likely and realistic-range clicks, orders, sales
and ROAS, plus industry advice and ad-policy warnings. Every figure in `shared/benchmarks.mjs` names its
source or is marked as an assumption. Replace the assumptions with real client data over time.

**Create campaign** (`web/create.js`, `web/publish.js`): build a Meta campaign (goal, budget, dates,
audience, placements, ad text), see a live estimate, save drafts, review exactly what would be sent to
Meta, and publish. Publishing currently uses the **dummy connector**: same steps and IDs as Meta's API,
but no real ad is created. Everything is created as **PAUSED**.

Needs one database update: run `supabase/migrations/0002_campaign_builder.sql` in the Supabase SQL Editor.

Next step for live publishing: a small server endpoint (Cloudflare Worker) that holds the Meta token and
sends the same payload to Meta's Marketing API, still as PAUSED.

## Tests

```bash
npm test          # connectors, demo data, simulator, publishing rules
npm run test:db   # applies all migrations to an in-memory Postgres and checks access rules
```
