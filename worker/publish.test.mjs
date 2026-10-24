// Runs the publish flow against fake Supabase and Meta servers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publish } from './index.mjs';

const ENV = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x', META_PAGE_ID: '555' };
const REQ = {
  id: 'r1', agency_id: 'a1', brand_id: 'b1', ad_account_id: 'acc1', objective: 'traffic', status: 'draft',
  name: 'Testing Page – Visits', daily_budget: '50000.00', start_date: '2999-01-01', end_date: null,
  settings: { cities: ['Bandung'], ageMin: 20, ageMax: 40, gender: 'all', placements: ['facebook'], primaryText: 'Halo', url: 'https://example.com' },
};

function fakeFetch({ member = true, account = { id: 'acc1', platform: 'meta', external_id: '123' }, failAt, req = REQ } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method ?? 'GET';
    const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
    const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
    if (u.host === 'proj.supabase.co') {
      if (u.pathname === '/auth/v1/user') return opts.headers.authorization === 'Bearer good' ? ok({ id: 'u1' }) : new Response('{}', { status: 401 });
      const table = u.pathname.split('/').pop();
      if (method === 'PATCH') return new Response(null, { status: 204 });
      if (table === 'campaign_requests') return ok([req]);
      if (table === 'agency_members') return ok(member ? [{ user_id: 'u1' }] : []);
      if (table === 'ad_accounts') return ok(account ? [account] : []);
      if (table === 'connections') return ok([{ access_token: 'META_TOKEN' }]);
    }
    if (u.host === 'graph.facebook.com') {
      const step = u.pathname.split('/').pop();
      if (step === failAt) return new Response(JSON.stringify({ error: { message: 'x', error_user_msg: 'Budget too low' } }), { status: 400 });
      if (step === 'search') return ok({ data: [{ key: '1234', name: 'Bandung' }] });
      if (step === 'adspixels') return ok({ data: [{ id: 'px1' }] });
      if (method === 'DELETE') return ok({ success: true });
      return ok({ id: `${step}_id` });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  fn.calls = calls;
  return fn;
}
const call = (f, token = 'good') => publish(new Request('https://x/api/publish', {
  method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ request_id: 'r1' }),
}), ENV, f);

test('creates campaign, ad set, creative and ad on Meta, all paused, then saves the ids', async () => {
  const f = fakeFetch();
  const r = await call(f);
  assert.equal(r.ok, true);
  assert.equal(r.external_ids.campaign_id, 'campaigns_id');
  assert.equal(r.external_ids.ad_id, 'ads_id');
  const posts = f.calls.filter((c) => c.method === 'POST');
  assert.deepEqual(posts.map((c) => c.path.split('/').pop()), ['campaigns', 'adsets', 'adcreatives', 'ads']);
  for (const p of [posts[0], posts[1], posts[3]]) assert.equal(p.body.status, 'PAUSED');
  assert.equal(posts[1].body.daily_budget, '50000');
  assert.equal(posts[1].body.campaign_id, 'campaigns_id');
  const targeting = JSON.parse(posts[1].body.targeting);
  assert.deepEqual(targeting.geo_locations.cities[0], { key: '1234', radius: 25, distance_unit: 'kilometer' });
  assert.equal(JSON.parse(posts[2].body.object_story_spec).page_id, '555');
  assert.ok(posts.every((p) => p.body.access_token === 'META_TOKEN'));
  const saved = f.calls.find((c) => c.method === 'PATCH');
  assert.equal(saved.body.status, 'published');
  assert.equal(saved.body.publish_mode, 'live');
});

test('rejects strangers and other agencies', async () => {
  await assert.rejects(call(fakeFetch(), 'bad'), /log in again/);
  await assert.rejects(call(fakeFetch({ member: false })), /not a member/);
});

test('refuses demo accounts and unsupported goals', async () => {
  await assert.rejects(call(fakeFetch({ account: { id: 'acc1', platform: 'meta', external_id: 'demo_meta_glowra' } })), /test mode/);
  await assert.rejects(call(fakeFetch({ req: { ...REQ, objective: 'leads' } })), /Website visits and Sales/);
});

test('if Meta rejects a later step, the campaign is deleted and the error is saved', async () => {
  const f = fakeFetch({ failAt: 'adsets' });
  await assert.rejects(call(f), /Budget too low/);
  assert.ok(f.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('campaigns_id')));
  const saved = f.calls.find((c) => c.method === 'PATCH');
  assert.equal(saved.body.status, 'failed');
  assert.match(saved.body.error, /Budget too low/);
});

test('missing Cloudflare secrets give a clear message', async () => {
  await assert.rejects(publish(new Request('https://x', { method: 'POST' }), { SUPABASE_URL: 'x' }, fakeFetch()), /SUPABASE_SERVICE_ROLE_KEY secret is missing/);
});
