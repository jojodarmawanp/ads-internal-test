// Daily sync: for every active Meta ad account, pull last 7 days and upsert into Supabase.
//
// Normal run (GitHub Actions):  node sync/index.mjs
//   needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_API_VERSION
//
// Dry run (no database, just print what Meta returns):
//   META_TOKEN=... META_AD_ACCOUNT=1234567890 node sync/index.mjs --dry-run

import { appendFileSync } from 'node:fs';
import { fetchAccountInfo, fetchDailyInsights } from './meta.mjs';

// Graph API v26.0 was released July 2026. Override with the META_API_VERSION variable when Meta ships a newer one.
const version = process.env.META_API_VERSION || 'v26.0';

// Writes a readable report on the GitHub Actions run page (no secrets in it).
function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

async function dryRun() {
  const token = process.env.META_TOKEN;
  const accountId = (process.env.META_AD_ACCOUNT || '').replace(/^act_/, '');
  if (!token || !accountId) throw new Error('Dry run needs META_TOKEN and META_AD_ACCOUNT.');
  let info;
  try {
    info = await fetchAccountInfo({ accountId, token, version });
  } catch (e) {
    summary(`## ❌ Meta connection failed\n\n**Error:** ${e.message}\n\nCheck that META_TOKEN is the full token and META_AD_ACCOUNT is the ad account number.`);
    throw e;
  }
  console.log('Account:', info);
  const rows = await fetchDailyInsights({ accountId, token, version });
  if (rows.length) console.table(rows);
  else console.log('No campaign data in the last 7 days (expected if no ads have run).');
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, imp: a.imp + r.impressions, clicks: a.clicks + r.clicks, rev: a.rev + r.revenue }),
    { spend: 0, imp: 0, clicks: 0, rev: 0 });
  const fmt = (n) => n.toLocaleString('id-ID');
  console.log(`Last 7 days: spend ${t.spend} ${info.currency}, revenue ${t.rev}, ROAS ${t.spend ? (t.rev / t.spend).toFixed(2) : '-'}`);
  summary([
    '## ✅ Meta connection works',
    '',
    `| Ad account | Currency | Time zone | API version |`,
    `| --- | --- | --- | --- |`,
    `| ${info.name} | ${info.currency} | ${info.timezone} | ${version} |`,
    '',
    '### Last 7 days',
    rows.length
      ? `| Campaigns | Spend | Impressions | Clicks | Revenue | ROAS |\n| --- | --- | --- | --- | --- | --- |\n| ${new Set(rows.map((r) => r.campaign_external_id)).size} | ${fmt(t.spend)} | ${fmt(t.imp)} | ${fmt(t.clicks)} | ${fmt(t.rev)} | ${t.spend ? (t.rev / t.spend).toFixed(2) : '-'} |`
      : 'No ad activity yet. That is expected until a campaign runs; the connection itself is working.',
  ].join('\n'));
}

async function syncAccount(db, account, token) {
  const accountId = account.external_id.replace(/^act_/, '');
  const info = await fetchAccountInfo({ accountId, token, version });
  const rows = await fetchDailyInsights({ accountId, token, version });

  // Upsert campaigns, then map external id -> our id
  const campaigns = [...new Map(rows.map((r) => [r.campaign_external_id, r])).values()].map((r) => ({
    ad_account_id: account.id,
    external_id: r.campaign_external_id,
    name: r.campaign_name,
    updated_at: new Date().toISOString(),
  }));
  const idByExternal = new Map();
  if (campaigns.length) {
    const { data, error } = await db.from('campaigns')
      .upsert(campaigns, { onConflict: 'ad_account_id,external_id' })
      .select('id, external_id');
    if (error) throw error;
    data.forEach((c) => idByExternal.set(c.external_id, c.id));
  }

  const metrics = rows.map((r) => ({
    campaign_id: idByExternal.get(r.campaign_external_id),
    date: r.date,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    purchases: r.purchases,
    revenue: r.revenue,
    synced_at: new Date().toISOString(),
  }));
  if (metrics.length) {
    const { error } = await db.from('daily_metrics').upsert(metrics, { onConflict: 'campaign_id,date' });
    if (error) throw error;
  }

  await db.from('ad_accounts').update({
    name: info.name, currency: info.currency, timezone: info.timezone,
    last_synced_at: new Date().toISOString(), last_sync_error: null,
  }).eq('id', account.id);

  return metrics.length;
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: run } = await db.from('sync_runs').insert({}).select('id').single();
  const { data: accounts, error } = await db.from('ad_accounts')
    .select('id, external_id, connections(access_token)')
    .eq('platform', 'meta').eq('is_active', true);
  if (error) throw error;

  let ok = 0, failed = 0;
  for (const account of accounts) {
    const token = account.connections?.access_token;
    try {
      if (!token) throw new Error('No access token saved for this ad account.');
      const n = await syncAccount(db, account, token);
      console.log(`OK   ${account.external_id}: ${n} rows`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${account.external_id}: ${e.message}`);
      await db.from('ad_accounts').update({ last_sync_error: e.message }).eq('id', account.id);
      failed++;
    }
  }

  await db.from('sync_runs').update({
    finished_at: new Date().toISOString(), accounts_ok: ok, accounts_failed: failed,
  }).eq('id', run.id);
  console.log(`Done: ${ok} ok, ${failed} failed`);
  if (failed && !ok) process.exit(1);
}

(process.argv.includes('--dry-run') ? dryRun() : main()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
