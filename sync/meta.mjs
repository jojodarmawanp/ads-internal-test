// Meta Marketing API: pull campaign-level daily insights for one ad account.
// Docs: https://developers.facebook.com/docs/marketing-api/insights

// Purchase action types, most complete first. We take the first one present so we never double count.
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

function pickAction(list) {
  if (!Array.isArray(list)) return 0;
  for (const type of PURCHASE_TYPES) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

// Turn one Meta insights row into our daily_metrics shape.
export function parseInsightRow(row) {
  return {
    campaign_external_id: row.campaign_id,
    campaign_name: row.campaign_name,
    date: row.date_start,
    spend: Number(row.spend) || 0,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.inline_link_clicks) || 0,
    purchases: pickAction(row.actions),
    revenue: pickAction(row.action_values),
  };
}

export async function fetchAccountInfo({ accountId, token, version }) {
  const url = new URL(`https://graph.facebook.com/${version}/act_${accountId}`);
  url.searchParams.set('fields', 'name,currency,timezone_name');
  url.searchParams.set('access_token', token);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`Meta ${res.status}: ${body?.error?.message ?? 'unknown error'}`);
  return { name: body.name, currency: body.currency, timezone: body.timezone_name };
}

// Default: last 7 complete days in the ad account's own time zone. Pass since/until (YYYY-MM-DD) for a custom range.
export async function fetchDailyInsights({ accountId, token, version, datePreset = 'last_7d', since, until }) {
  const url = new URL(`https://graph.facebook.com/${version}/act_${accountId}/insights`);
  url.searchParams.set('level', 'campaign');
  url.searchParams.set('time_increment', '1');
  if (since && until) url.searchParams.set('time_range', JSON.stringify({ since, until }));
  else url.searchParams.set('date_preset', datePreset);
  url.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values');
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', token);

  const rows = [];
  let next = url.toString();
  while (next) {
    const res = await fetch(next);
    const body = await res.json();
    if (!res.ok) throw new Error(`Meta ${res.status}: ${body?.error?.message ?? 'unknown error'}`);
    rows.push(...(body.data ?? []).map(parseInsightRow));
    next = body.paging?.next ?? null;
  }
  return rows;
}
