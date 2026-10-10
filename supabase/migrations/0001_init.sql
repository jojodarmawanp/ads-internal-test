-- Phase 1 schema: agencies -> brands -> ad accounts -> daily campaign metrics.
-- Run in Supabase: SQL Editor -> paste -> Run.

create extension if not exists pgcrypto;

create type platform as enum ('meta', 'tiktok', 'shopee');
create type member_role as enum ('owner', 'member');

-- Organisation that manages many brands
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table agency_members (
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- One row per platform ad account (Meta act_..., TikTok advertiser_id, Shopee shop_id)
create table ad_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform platform not null,
  external_id text not null,
  name text,
  currency text,
  timezone text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);

-- Secrets. No RLS policy is created, so only the service role (sync job) can read it.
create table connections (
  ad_account_id uuid primary key references ad_accounts(id) on delete cascade,
  access_token text not null,
  token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  external_id text not null,
  name text,
  updated_at timestamptz not null default now(),
  unique (ad_account_id, external_id)
);

-- Raw daily totals per campaign. Ratios (CTR, CPC, ROAS) are computed when reading.
create table daily_metrics (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  date date not null,
  spend numeric(18,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  purchases numeric(18,2) not null default 0,
  revenue numeric(18,2) not null default 0,
  synced_at timestamptz not null default now(),
  primary key (campaign_id, date)
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  accounts_ok int default 0,
  accounts_failed int default 0,
  notes text
);

create index on brands (agency_id);
create index on ad_accounts (brand_id);
create index on campaigns (ad_account_id);
create index on daily_metrics (date);

-- ---------- Row Level Security ----------
alter table agencies enable row level security;
alter table agency_members enable row level security;
alter table brands enable row level security;
alter table ad_accounts enable row level security;
alter table connections enable row level security;   -- no policies: dashboard can never read tokens
alter table campaigns enable row level security;
alter table daily_metrics enable row level security;
alter table sync_runs enable row level security;     -- no policies: internal only

create or replace function is_agency_member(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agency_members m where m.agency_id = a and m.user_id = auth.uid());
$$;

create policy "members read agency" on agencies
  for select using (is_agency_member(id));

create policy "members read memberships" on agency_members
  for select using (is_agency_member(agency_id));

create policy "members read brands" on brands
  for select using (is_agency_member(agency_id));

create policy "members read ad accounts" on ad_accounts
  for select using (exists (select 1 from brands b where b.id = brand_id and is_agency_member(b.agency_id)));

create policy "members read campaigns" on campaigns
  for select using (exists (
    select 1 from ad_accounts a join brands b on b.id = a.brand_id
    where a.id = ad_account_id and is_agency_member(b.agency_id)));

create policy "members read metrics" on daily_metrics
  for select using (exists (
    select 1 from campaigns c join ad_accounts a on a.id = c.ad_account_id join brands b on b.id = a.brand_id
    where c.id = campaign_id and is_agency_member(b.agency_id)));

-- Convenience view for the dashboard (inherits RLS from base tables)
create view brand_daily with (security_invoker = true) as
select b.id as brand_id, b.name as brand_name, a.platform, a.currency, m.date,
       sum(m.spend) as spend, sum(m.impressions) as impressions, sum(m.clicks) as clicks,
       sum(m.purchases) as purchases, sum(m.revenue) as revenue
from daily_metrics m
join campaigns c on c.id = m.campaign_id
join ad_accounts a on a.id = c.ad_account_id
join brands b on b.id = a.brand_id
group by b.id, b.name, a.platform, a.currency, m.date;
