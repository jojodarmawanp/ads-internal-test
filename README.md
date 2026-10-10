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
