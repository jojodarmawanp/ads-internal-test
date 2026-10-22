-- Phase 2a: brand industry + campaigns created from the dashboard.
-- Run in Supabase: SQL Editor -> paste -> Run. Safe to run once after 0001.

alter table brands add column if not exists industry text;

-- Members may change only the industry of their brands (nothing else on the table).
create policy "members set brand industry" on brands
  for update using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
revoke update on brands from authenticated;
grant update (industry) on brands to authenticated;

-- A campaign built in the dashboard: saved as a draft, then published to the platform.
-- publish_mode: 'dummy' = simulated connector (no real ad created), 'live' = sent to the platform API.
create table campaign_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete set null,
  platform platform not null default 'meta',
  name text not null check (length(name) between 1 and 200),
  objective text not null check (objective in ('sales', 'traffic', 'leads', 'whatsapp')),
  daily_budget numeric(18,2) not null check (daily_budget > 0),
  start_date date not null,
  end_date date,
  settings jsonb not null default '{}',
  estimate jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'failed')),
  publish_mode text check (publish_mode in ('dummy', 'live')),
  external_ids jsonb,
  error text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index on campaign_requests (agency_id, created_at desc);

alter table campaign_requests enable row level security;

create or replace function brand_in_agency(b uuid, a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from brands where id = b and agency_id = a);
$$;

create or replace function account_in_brand(acc uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select acc is null or exists (select 1 from ad_accounts where id = acc and brand_id = b);
$$;

create policy "members read requests" on campaign_requests
  for select using (is_agency_member(agency_id));
create policy "members create requests" on campaign_requests
  for insert with check (is_agency_member(agency_id) and brand_in_agency(brand_id, agency_id)
    and account_in_brand(ad_account_id, brand_id));
create policy "members update requests" on campaign_requests
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and brand_in_agency(brand_id, agency_id)
    and account_in_brand(ad_account_id, brand_id));
create policy "members delete drafts" on campaign_requests
  for delete using (is_agency_member(agency_id) and status = 'draft');
