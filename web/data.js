// Data source: Supabase (real) or in-browser demo (preview, when no Supabase config is set).
import config from './config.js';
import { DEMO_BRANDS, demoAccounts, dailyRows, jakartaDate } from './shared/mock.mjs';

export const previewMode = !config.supabaseUrl || !config.supabaseAnonKey;

let client;
async function supabase() {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return client;
}

// ---------- auth ----------
export async function currentUser() {
  if (previewMode) return { email: 'preview@demo' };
  const db = await supabase();
  const { data } = await db.auth.getSession();
  return data.session?.user ?? null;
}

export async function sendLoginLink(email) {
  const db = await supabase();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) {
    if (/signups? not allowed|not found/i.test(error.message)) {
      throw new Error('This email has no access yet. Ask your agency owner to add you.');
    }
    if (/rate limit/i.test(error.message)) throw new Error('Too many login emails sent. Wait a few minutes and try again.');
    throw new Error(error.message);
  }
}

export async function signOut() {
  if (previewMode) return;
  await (await supabase()).auth.signOut();
}

export async function onAuthChange(fn) {
  if (previewMode) return;
  (await supabase()).auth.onAuthStateChange((_event, session) => fn(session?.user ?? null));
}

// ---------- data ----------
// Returns everything the dashboard needs from `since` (YYYY-MM-DD) to yesterday.
export async function loadData(since) {
  return previewMode ? previewData(since) : supabaseData(since);
}

async function all(query) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function supabaseData(since) {
  const db = await supabase();
  const [agencies, accounts, campaigns, metrics] = await Promise.all([
    all(() => db.from('agencies').select('id, name').order('name')),
    all(() => db.from('ad_accounts')
      .select('id, platform, external_id, name, currency, last_synced_at, last_sync_error, is_active, brand:brands(id, name, industry)')
      .order('created_at')),
    all(() => db.from('campaigns').select('id, name, ad_account_id').order('id')),
    all(() => db.from('daily_metrics')
      .select('campaign_id, date, spend, impressions, clicks, purchases, revenue')
      .gte('date', since).order('date').order('campaign_id')),
  ]);
  return {
    agencyId: agencies[0]?.id ?? null,
    agencyName: agencies[0]?.name ?? 'Your agency',
    accounts,
    campaigns,
    metrics: metrics.map((m) => ({
      ...m, spend: +m.spend, impressions: +m.impressions, clicks: +m.clicks, purchases: +m.purchases, revenue: +m.revenue,
    })),
  };
}

function previewData(since) {
  const until = jakartaDate(-1);
  const accounts = [];
  const campaigns = [];
  const metrics = [];
  const brandIds = new Map();
  for (const a of demoAccounts()) {
    if (!brandIds.has(a.brand_slug)) brandIds.set(a.brand_slug, `b-${a.brand_slug}`);
    accounts.push({
      id: a.external_id, platform: a.platform, external_id: a.external_id, name: a.name, currency: 'IDR',
      last_synced_at: new Date().toISOString(), last_sync_error: null, is_active: true,
      brand: { id: brandIds.get(a.brand_slug), name: a.brand_name, industry: DEMO_BRANDS.find((b) => b.slug === a.brand_slug)?.industry ?? null },
    });
    const seen = new Set();
    for (const r of dailyRows(a.external_id, since, until)) {
      if (!seen.has(r.campaign_external_id)) {
        seen.add(r.campaign_external_id);
        campaigns.push({ id: r.campaign_external_id, name: r.campaign_name, ad_account_id: a.external_id });
      }
      metrics.push({ campaign_id: r.campaign_external_id, date: r.date, spend: r.spend, impressions: r.impressions,
        clicks: r.clicks, purchases: r.purchases, revenue: r.revenue });
    }
  }
  return Promise.resolve({ agencyId: 'preview', agencyName: 'Preview agency', accounts, campaigns, metrics });
}

// ---------- brand industry + campaigns created in the dashboard ----------
const previewStore = { requests: [], industries: new Map() };

export async function setBrandIndustry(brandId, industry) {
  if (previewMode || String(brandId).startsWith('b-')) { previewStore.industries.set(brandId, industry); return; }
  const { error } = await (await supabase()).from('brands').update({ industry }).eq('id', brandId);
  if (error) throw new Error(friendly(error));
}
export const previewIndustry = (brandId) => previewStore.industries.get(brandId);

export async function listRequests() {
  if (previewMode) return [...previewStore.requests];
  const { data, error } = await (await supabase()).from('campaign_requests').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) {
    if (/campaign_requests/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
      throw new Error('The database is missing the campaign table. Run supabase/migrations/0002_campaign_builder.sql in the Supabase SQL Editor.');
    }
    throw new Error(friendly(error));
  }
  return data;
}

export async function saveRequest(req) {
  const row = { ...req, updated_at: new Date().toISOString() };
  if (previewMode) {
    if (!row.id) { row.id = `p-${Date.now()}`; row.created_at = row.updated_at; previewStore.requests.unshift(row); }
    else { const i = previewStore.requests.findIndex((r) => r.id === row.id); previewStore.requests[i] = { ...previewStore.requests[i], ...row }; }
    return previewStore.requests.find((r) => r.id === row.id);
  }
  const db = await supabase();
  const q = row.id ? db.from('campaign_requests').update(row).eq('id', row.id) : db.from('campaign_requests').insert(row);
  const { data, error } = await q.select('*').single();
  if (error) throw new Error(friendly(error));
  return data;
}

export async function deleteRequest(id) {
  if (previewMode) { previewStore.requests = previewStore.requests.filter((r) => r.id !== id); return; }
  const { error } = await (await supabase()).from('campaign_requests').delete().eq('id', id);
  if (error) throw new Error(friendly(error));
}

function friendly(error) {
  if (/row-level security/i.test(error.message)) return 'You do not have permission to change this. Make sure you are a member of this agency.';
  return error.message;
}
