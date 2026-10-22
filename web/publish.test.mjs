import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaPayload, validate, publishDummy } from './publish.js';

const base = {
  brand_id: 'b1', name: 'Glowra – Sales', objective: 'sales', daily_budget: 100000,
  start_date: '2999-01-01', end_date: '2999-01-31',
  settings: { cities: [], ageMin: 18, ageMax: 45, gender: 'women', placements: ['facebook', 'instagram'], primaryText: 'Serum baru', url: 'https://example.com' },
};

test('a complete draft passes validation', () => assert.deepEqual(validate(base), {}));

test('validation catches the usual mistakes', () => {
  const e = validate({ ...base, daily_budget: 5000, end_date: '2998-01-01', settings: { ...base.settings, url: 'example.com', placements: [] } });
  assert.ok(e.daily_budget && e.end_date && e.url && e.placements);
  assert.ok(validate({ ...base, objective: 'whatsapp' }).whatsapp);
  assert.deepEqual(validate({ ...base, objective: 'whatsapp', settings: { ...base.settings, whatsapp: '0812 3456 7890' } }), {});
});

test('everything sent to Meta starts paused, with the right objective and targeting', () => {
  const p = metaPayload(base);
  assert.equal(p.campaign.status, 'PAUSED');
  assert.equal(p.adset.status, 'PAUSED');
  assert.equal(p.ad.status, 'PAUSED');
  assert.equal(p.campaign.objective, 'OUTCOME_SALES');
  assert.equal(p.adset.daily_budget, 100000);
  assert.deepEqual(p.adset.targeting.genders, [2]);
  assert.deepEqual(p.adset.targeting.geo_locations, { countries: ['ID'] });
});

test('dummy publish returns ids and never claims to be live', async () => {
  const r = await publishDummy(base);
  assert.equal(r.publish_mode, 'dummy');
  assert.match(r.external_ids.campaign_id, /^dummy_/);
});
