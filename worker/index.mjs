// Cloudflare Worker ("the back-office clerk").
// Serves the dashboard files, plus POST /api/publish which creates a campaign on Meta as PAUSED.
// The Meta token never leaves the server: it is read from Supabase with the secret key.
//
// Cloudflare secrets (Settings -> Variables and Secrets, type Secret):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_PAGE_ID
// Optional: META_API_VERSION (default v26.0)

import { metaPayload, LIVE_GOALS } from '../web/publish.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/publish') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      try {
        return json(await publish(request, env));
      } catch (e) {
        return json({ error: e.message }, e.status ?? 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export async function publish(request, env, fetchImpl = fetch) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_PAGE_ID']) {
    if (!env[k]) throw fail(`Live publishing is not set up yet: the ${k} secret is missing in Cloudflare.`, 503);
  }
  const db = supabase(env, fetchImpl);

  // 1. Who is asking?
  const userToken = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!userToken) throw fail('Please log in again.', 401);
  const user = await db.user(userToken);

  const { request_id: id } = await request.json().catch(() => ({}));
  if (!id) throw fail('Missing campaign id.');

  // 2. The saved campaign, and is this person in the agency that owns it?
  const req = await db.one('campaign_requests', `id=eq.${enc(id)}`);
  if (!req) throw fail('Campaign not found.', 404);
  const member = await db.one('agency_members', `agency_id=eq.${enc(req.agency_id)}&user_id=eq.${enc(user.id)}`);
  if (!member) throw fail('You are not a member of the agency that owns this campaign.', 403);
  if (req.status === 'published') throw fail('This campaign is already published.', 409);
  if (!LIVE_GOALS.includes(req.objective)) {
    throw fail('Live publishing supports Website visits and Sales for now. Use test mode for leads and WhatsApp.');
  }

  // 3. The brand's real Meta ad account and its token (only readable with the secret key)
  const account = req.ad_account_id ? await db.one('ad_accounts', `id=eq.${enc(req.ad_account_id)}`) : null;
  if (!account || account.platform !== 'meta') throw fail('This brand has no Meta ad account connected.');
  if (account.external_id.startsWith('demo_')) throw fail('Demo brands can only publish in test mode.');
  const conn = await db.one('connections', `ad_account_id=eq.${enc(account.id)}`);
  if (!conn?.access_token) throw fail('No Meta token saved for this ad account.');

  const meta = graph(env, conn.access_token, fetchImpl);
  const act = `act_${account.external_id.replace(/^act_/, '')}`;

  // 4. Fill in what only Meta knows: city keys and, for sales, the Pixel
  const cityKeys = {};
  for (const name of req.settings?.cities ?? []) {
    const r = await meta.get('search', { type: 'adgeolocation', location_types: '["city"]', q: name, country_code: 'ID', limit: '1' });
    if (!r.data?.[0]?.key) throw fail(`Meta could not find the city "${name}".`);
    cityKeys[name] = r.data[0].key;
  }
  let pixelId;
  if (req.objective === 'sales') {
    const r = await meta.get(`${act}/adspixels`, { fields: 'id,name', limit: '1' });
    pixelId = r.data?.[0]?.id;
    if (!pixelId) throw fail('Sales campaigns need a Meta Pixel on your website. Use "Website visits" until a Pixel is set up.');
  }
  const p = metaPayload(req, { pageId: env.META_PAGE_ID, pixelId, cityKeys });

  // 5. Create campaign -> ad set -> creative -> ad, all PAUSED. Undo the campaign if a later step fails.
  const ids = {};
  try {
    ids.campaign_id = (await meta.post(`${act}/campaigns`, p.campaign)).id;
    ids.adset_id = (await meta.post(`${act}/adsets`, { ...p.adset, campaign_id: ids.campaign_id })).id;
    ids.creative_id = (await meta.post(`${act}/adcreatives`, p.creative)).id;
    ids.ad_id = (await meta.post(`${act}/ads`, { ...p.ad, adset_id: ids.adset_id, creative: { creative_id: ids.creative_id } })).id;
  } catch (e) {
    if (ids.campaign_id) await meta.del(ids.campaign_id).catch(() => {});
    await db.patch('campaign_requests', id, { status: 'failed', publish_mode: 'live', error: e.message, updated_at: new Date().toISOString() });
    throw fail(`Meta did not accept the campaign: ${e.message}`, 502);
  }

  const link = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.slice(4)}&selected_campaign_ids=${ids.campaign_id}`;
  const external_ids = { ...ids, status: 'PAUSED', ads_manager_url: link };
  await db.patch('campaign_requests', id, { status: 'published', publish_mode: 'live', external_ids, error: null, updated_at: new Date().toISOString() });
  return { ok: true, external_ids };
}

const enc = encodeURIComponent;

function supabase(env, fetchImpl) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  return {
    async user(token) {
      const r = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${token}` } });
      if (!r.ok) throw fail('Your login has expired. Please log in again.', 401);
      return r.json();
    },
    async one(table, query) {
      const r = await fetchImpl(`${base}/rest/v1/${table}?${query}&limit=1`, { headers });
      if (!r.ok) throw fail(`Database error (${table}): ${await r.text()}`, 500);
      return (await r.json())[0] ?? null;
    },
    async patch(table, id, body) {
      const r = await fetchImpl(`${base}/rest/v1/${table}?id=eq.${enc(id)}`, {
        method: 'PATCH', headers: { ...headers, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw fail(`Database error (${table}): ${await r.text()}`, 500);
    },
  };
}

function graph(env, token, fetchImpl) {
  const base = `https://graph.facebook.com/${env.META_API_VERSION || 'v26.0'}`;
  const handle = async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) {
      const e = body.error ?? {};
      const ref = [e.code && `code ${e.code}`, e.error_subcode && `subcode ${e.error_subcode}`, e.fbtrace_id && `trace ${e.fbtrace_id}`].filter(Boolean).join(', ');
      throw new Error(`${e.error_user_msg || e.error_user_title || e.message || `HTTP ${r.status}`}${ref ? ` (${ref})` : ''}`);
    }
    return body;
  };
  const form = (obj) => {
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) f.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    f.set('access_token', token);
    return f;
  };
  return {
    get: (path, params = {}) => fetchImpl(`${base}/${path}?${form(params)}`).then(handle),
    post: (path, params) => fetchImpl(`${base}/${path}`, { method: 'POST', body: form(params) }).then(handle),
    del: (path) => fetchImpl(`${base}/${path}?${form({})}`, { method: 'DELETE' }).then(handle),
  };
}
