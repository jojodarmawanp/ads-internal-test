import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSupabaseEnv } from './supabase.mjs';

test('accepts a correct project URL and secret key', () => {
  assert.deepEqual(checkSupabaseEnv('https://abcd1234.supabase.co/', 'sb_secret_x'), { url: 'https://abcd1234.supabase.co', key: 'sb_secret_x' });
});
test('explains when the dashboard URL was pasted', () => {
  assert.throws(() => checkSupabaseEnv('https://supabase.com/dashboard/project/abcd1234', 'k'), /https:\/\/abcd1234\.supabase\.co/);
});
test('rejects the publishable key', () => {
  assert.throws(() => checkSupabaseEnv('https://abcd1234.supabase.co', 'sb_publishable_x'), /publishable/);
});
