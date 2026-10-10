import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInsightRow } from './meta.mjs';

test('parses a Meta insights row with purchases', () => {
  const row = parseInsightRow({
    campaign_id: '111', campaign_name: 'Cookies - Sales', date_start: '2026-10-08',
    spend: '150000.50', impressions: '12000', inline_link_clicks: '240',
    actions: [{ action_type: 'link_click', value: '240' }, { action_type: 'purchase', value: '6' }],
    action_values: [{ action_type: 'purchase', value: '900000' }],
  });
  assert.deepEqual(row, {
    campaign_external_id: '111', campaign_name: 'Cookies - Sales', date: '2026-10-08',
    spend: 150000.5, impressions: 12000, clicks: 240, purchases: 6, revenue: 900000,
  });
});

test('prefers omni_purchase and never double counts', () => {
  const row = parseInsightRow({
    campaign_id: '1', date_start: '2026-10-08', spend: '1',
    actions: [{ action_type: 'purchase', value: '3' }, { action_type: 'omni_purchase', value: '4' }],
  });
  assert.equal(row.purchases, 4);
});

test('missing fields become zero', () => {
  const row = parseInsightRow({ campaign_id: '1', date_start: '2026-10-08' });
  assert.equal(row.spend, 0);
  assert.equal(row.clicks, 0);
  assert.equal(row.revenue, 0);
});
