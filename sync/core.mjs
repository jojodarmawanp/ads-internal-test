// Shared sync logic: pick the right connector for an ad account, pull rows, save them.
import * as meta from './meta.mjs';
import * as mock from '../shared/mock.mjs';

export const META_VERSION = process.env.META_API_VERSION || 'v26.0';

// The "plug": every connector exposes fetchAccountInfo + fetchDailyInsights with the same output.
// Demo accounts always use the mock connector; real accounts use their platform's connector.
export function connectorFor(account) {
  if (mock.isDemo(account.external_id)) return { name: 'demo', api: mock, needsToken: false };
  if (account.platform === 'meta') return { name: 'meta', api: meta, needsToken: true };
  return null; // TikTok / Shopee real connectors come after approvals
}

function chunks(list, size = 500) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// range: { since, until } (YYYY-MM-DD) or undefined for the connector's default (last 7 days).
export async function syncAccount(db, account, { token, range } = {}) {
  const connector = connectorFor(account);
  if (!connector) throw new Error(`No ${account.platform} connector yet (needs platform API approval).`);
  if (connector.needsToken && !token) throw new Error('No access token saved for this ad account.');

  const accountId = account.external_id.replace(/^act_/, '');
  const args = { accountId, token, version: META_VERSION, ...(range ?? {}) };
  const info = await connector.api.fetchAccountInfo(args);
  const rows = await connector.api.fetchDailyInsights(args);

  const campaigns = [...new Map(rows.map((r) => [r.campaign_external_id, r])).values()].map((r) => ({
    ad_account_id: account.id,
    external_id: r.campaign_external_id,
    name: r.campaign_name,
    updated_at: new Date().toISOString(),
  }));
  const idByExternal = new Map();
  for (const part of chunks(campaigns)) {
    const { data, error } = await db.from('campaigns')
      .upsert(part, { onConflict: 'ad_account_id,external_id' })
      .select('id, external_id');
    if (error) throw new Error(error.message);
    data.forEach((c) => idByExternal.set(c.external_id, c.id));
  }

  const now = new Date().toISOString();
  const metrics = rows.map((r) => ({
    campaign_id: idByExternal.get(r.campaign_external_id),
    date: r.date,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
    purchases: r.purchases,
    revenue: r.revenue,
    synced_at: now,
  }));
  for (const part of chunks(metrics)) {
    const { error } = await db.from('daily_metrics').upsert(part, { onConflict: 'campaign_id,date' });
    if (error) throw new Error(error.message);
  }

  const { error } = await db.from('ad_accounts').update({
    name: info.name, currency: info.currency, timezone: info.timezone,
    last_synced_at: now, last_sync_error: null,
  }).eq('id', account.id);
  if (error) throw new Error(error.message);

  return { rows: metrics.length, connector: connector.name };
}
