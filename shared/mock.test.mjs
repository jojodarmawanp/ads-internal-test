import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyRows, demoAccounts, dateRange, fetchAccountInfo, isDemo } from './mock.mjs';

test('demo data is repeatable for the same day', () => {
  const a = dailyRows('demo_shopee_kopi-senja', '2026-10-01', '2026-10-03');
  const b = dailyRows('demo_shopee_kopi-senja', '2026-10-01', '2026-10-03');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3 * 3); // 3 days x 3 campaigns
});

test('rows have the same shape as the Meta connector', () => {
  const [row] = dailyRows('demo_meta_glowra', '2026-10-05', '2026-10-05');
  assert.deepEqual(Object.keys(row).sort(), ['campaign_external_id', 'campaign_name', 'clicks', 'date', 'impressions', 'purchases', 'revenue', 'spend']);
  assert.ok(row.spend > 0 && row.impressions > row.clicks && row.clicks > 0);
});

test('double date (10.10) spikes marketplace spend', () => {
  const day = (d) => dailyRows('demo_tiktok_snackit', d, d).reduce((t, r) => t + r.spend, 0);
  assert.ok(day('2026-10-10') > 1.8 * day('2026-10-07'));
});

test('every demo account resolves and is marked demo', async () => {
  for (const a of demoAccounts()) {
    assert.ok(isDemo(a.external_id));
    assert.equal((await fetchAccountInfo({ accountId: a.external_id })).currency, 'IDR');
  }
  assert.equal(dateRange('2026-10-30', '2026-11-02').length, 4);
});
