// One-time setup: create agency + brand + Meta ad account + token in Supabase,
// and make OWNER_EMAIL the agency owner. Safe to run again (it updates, never duplicates).
//
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, META_TOKEN, META_AD_ACCOUNT, OWNER_EMAIL
// Optional: AGENCY_NAME, BRAND_NAME

import { appendFileSync } from 'node:fs';
import { adminClient } from './supabase.mjs';

const need = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'META_TOKEN', 'META_AD_ACCOUNT', 'OWNER_EMAIL'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);

const agencyName = process.env.AGENCY_NAME || 'My Agency';
const brandName = process.env.BRAND_NAME || 'Testing Page';
const email = process.env.OWNER_EMAIL.trim().toLowerCase();
const adAccount = process.env.META_AD_ACCOUNT.replace(/^act_/, '').trim();

const db = adminClient();

const must = ({ data, error }) => {
  if (!error) return data;
  const msg = String(error.message ?? error);
  throw new Error(msg.startsWith('<') ? 'Supabase returned a web page instead of data. Check that SUPABASE_URL is https://your-project-id.supabase.co' : msg);
};

async function findOrCreate(table, match, values = match) {
  let q = db.from(table).select('id');
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const found = must(await q.limit(1));
  if (found.length) return found[0].id;
  return must(await db.from(table).insert(values).select('id').single()).id;
}

async function findOrCreateUser() {
  for (let page = 1; page < 50; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }));
    const u = users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (users.length < 200) break;
  }
  return must(await db.auth.admin.createUser({ email, email_confirm: true })).user.id;
}

const agencyId = await findOrCreate('agencies', { name: agencyName });
const brandId = await findOrCreate('brands', { agency_id: agencyId, name: brandName });

const account = must(await db.from('ad_accounts')
  .upsert({ brand_id: brandId, platform: 'meta', external_id: adAccount, is_active: true }, { onConflict: 'platform,external_id' })
  .select('id').single());

must(await db.from('connections')
  .upsert({ ad_account_id: account.id, access_token: process.env.META_TOKEN, updated_at: new Date().toISOString() }));

const userId = await findOrCreateUser();
must(await db.from('agency_members').upsert({ agency_id: agencyId, user_id: userId, role: 'owner' }));

const report = [
  '## ✅ Setup done',
  '',
  '| Item | Value |',
  '| --- | --- |',
  `| Agency | ${agencyName} |`,
  `| Brand | ${brandName} |`,
  `| Meta ad account | ${adAccount} |`,
  `| Owner login | ${email} |`,
  '',
  'Next: run **Daily ads sync** to pull the data.',
].join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
