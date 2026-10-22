import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIES, PLATFORMS, SOURCES, simulatePlan, simulatePlatform, normaliseSplit } from './benchmarks.mjs';

test('every figure names a known source', () => {
  for (const p of Object.values(PLATFORMS)) {
    for (const [k, v] of Object.entries(p)) if (k !== 'name') assert.ok(SOURCES[v.source], `${p.name}.${k}`);
  }
});

test('ranges are ordered low <= likely <= high for every industry and platform', () => {
  for (const ind of Object.keys(INDUSTRIES)) {
    for (const p of ['meta', 'tiktok', 'shopee']) {
      const r = simulatePlatform(p, ind, 3e6);
      for (const k of ['clicks', 'results', 'sales', 'roas']) {
        assert.ok(r[k].low <= r[k].likely && r[k].likely <= r[k].high, `${ind}/${p}/${k}`);
      }
    }
  }
});

test('likely ROAS stays in a believable band (0.8x to 6x)', () => {
  for (const ind of Object.keys(INDUSTRIES)) {
    const { total } = simulatePlan({ industry: ind, budget: 5e6, platforms: ['meta', 'tiktok', 'shopee'] });
    assert.ok(total.roas.likely > 0.8 && total.roas.likely < 6, `${ind}: ${total.roas.likely}`);
  }
});

test('budget split always sums to 100% of the chosen platforms', () => {
  const s = normaliseSplit({ meta: 0.2, tiktok: 0.5, shopee: 0.3 }, ['meta', 'shopee']);
  assert.ok(Math.abs(s.meta + s.shopee - 1) < 1e-9);
  const { rows } = simulatePlan({ industry: 'food', budget: 1e6, platforms: ['meta', 'shopee'] });
  assert.equal(Math.round(rows.reduce((t, r) => t + r.budget, 0)), 1e6);
});

test('more budget never means fewer results', () => {
  const a = simulatePlatform('shopee', 'fashion', 1e6), b = simulatePlatform('shopee', 'fashion', 2e6);
  assert.ok(b.results.likely >= a.results.likely);
});
