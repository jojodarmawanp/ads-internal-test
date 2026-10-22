// Daily sync: for every active Meta ad account, pull last 7 days and upsert into Supabase.
//
// Normal run (GitHub Actions):  node sync/index.mjs
//   needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_API_VERSION
//
// Dry run (no database, just print what Meta returns):
//   META_TOKEN=... META_AD_ACCOUNT=1234567890 node sync/index.mjs --dry-run

import { appendFileSync } from 'node:fs';
import { fetchAccountInfo, fetchDailyInsights } from './meta.mjs';
import { syncAccount, META_VERSION as version } from './core.mjs';

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

async function main() {
  const { adminClient } = await import('./supabase.mjs');
  const db = adminClient();

  const { data: run } = await db.from('sync_runs').insert({}).select('id').single();
  const { data: accounts, error } = await db.from('ad_accounts')
    .select('id, platform, external_id, connections(access_token)')
    .eq('is_active', true);
  if (error) throw error;

  if (!accounts.length) {
    console.log('No active ad accounts yet. Run the "Setup: connect Meta account" workflow first.');
    summary('## ⚠️ Nothing to sync\n\nNo ad accounts are connected yet. Run the **Setup: connect Meta account** workflow first.');
  }

  let ok = 0, failed = 0;
  const lines = [];
  for (const account of accounts) {
    const token = account.connections?.access_token;
    const label = (a) => (a.external_id.startsWith('demo_') ? `${a.external_id} (demo)` : `${a.platform} ad account`);
    try {
      const { rows: n, connector } = await syncAccount(db, account, { token });
      console.log(`OK   ${account.external_id}: ${n} rows (${connector})`);
      lines.push(`| ${label(account)} | ✅ | ${n} daily rows saved |`);
      ok++;
    } catch (e) {
      console.error(`FAIL ${account.external_id}: ${e.message}`);
      lines.push(`| ${label(account)} | ❌ | ${e.message} |`);
      await db.from('ad_accounts').update({ last_sync_error: e.message }).eq('id', account.id);
      failed++;
    }
  }

  await db.from('sync_runs').update({
    finished_at: new Date().toISOString(), accounts_ok: ok, accounts_failed: failed,
  }).eq('id', run.id);
  console.log(`Done: ${ok} ok, ${failed} failed`);
  if (lines.length) {
    summary([`## Daily sync: ${ok} ok, ${failed} failed`, '', '| Ad account | Status | Detail |', '| --- | --- | --- |', ...lines,
      '', ok && lines.every((l) => l.includes(' 0 daily rows')) ? '_0 rows is expected until a campaign has run._' : ''].join('\n'));
  }
  if (failed && !ok) process.exit(1);
}

(process.argv.includes('--dry-run') ? dryRun() : main()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
