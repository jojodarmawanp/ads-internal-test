// Load or remove demo brands (Meta, TikTok, Shopee) in the owner's agency.
// Demo accounts use the mock connector, so the daily sync keeps them fresh automatically.
//
// Needs: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL
// Optional: DEMO_ACTION = load (default) | remove, DEMO_DAYS = 60

import { appendFileSync } from 'node:fs';
import { adminClient } from './supabase.mjs';
import { syncAccount } from './core.mjs';
import { DEMO_BRANDS, DEMO_PREFIX, demoAccounts, jakartaDate } from '../shared/mock.mjs';

const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
if (!email) throw new Error('Missing OWNER_EMAIL.');
const action = (process.env.DEMO_ACTION || 'load').toLowerCase();
const days = Math.min(Math.max(Number(process.env.DEMO_DAYS) || 60, 7), 120);

const db = adminClient();
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const summary = (md) => { console.log(md); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); };

async function ownerAgency() {
  let userId;
  for (let page = 1; page < 50 && !userId; page++) {
    const { users } = must(await db.auth.admin.listUsers({ page, perPage: 200 }));
    userId = users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (users.length < 200) break;
  }
  if (!userId) throw new Error(`No user with email ${email}. Run "Setup: connect Meta account" first with this email.`);
  const rows = must(await db.from('agency_members').select('agency_id, agencies(name)').eq('user_id', userId).eq('role', 'owner').limit(1));
  if (!rows.length) throw new Error(`${email} is not an agency owner yet. Run "Setup: connect Meta account" first.`);
  return { id: rows[0].agency_id, name: rows[0].agencies?.name };
}

const agency = await ownerAgency();
const demoBrandNames = DEMO_BRANDS.map((b) => b.name);

if (action === 'remove') {
  must(await db.from('ad_accounts').delete().like('external_id', `${DEMO_PREFIX}%`));
  must(await db.from('brands').delete().eq('agency_id', agency.id).in('name', demoBrandNames));
  summary(`## 🧹 Demo data removed\n\nDemo brands and their numbers were deleted from **${agency.name}**. Real accounts were not touched.`);
  process.exit(0);
}

const since = jakartaDate(-days);
const until = jakartaDate(-1);
const lines = [];
for (const a of demoAccounts()) {
  let brand = must(await db.from('brands').select('id').eq('agency_id', agency.id).eq('name', a.brand_name).limit(1))[0];
  if (!brand) brand = must(await db.from('brands').insert({ agency_id: agency.id, name: a.brand_name }).select('id').single());
  const industry = DEMO_BRANDS.find((b) => b.slug === a.brand_slug)?.industry;
  if (industry) await db.from('brands').update({ industry }).eq('id', brand.id); // ignored if 0002 is not applied yet
  const account = must(await db.from('ad_accounts')
    .upsert({ brand_id: brand.id, platform: a.platform, external_id: a.external_id, name: a.name, currency: 'IDR', timezone: 'Asia/Jakarta', is_active: true },
      { onConflict: 'platform,external_id' })
    .select('id, platform, external_id').single());
  const { rows } = await syncAccount(db, account, { range: { since, until } });
  lines.push(`| ${a.brand_name} | ${a.platform} | ${rows} |`);
}

summary([
  `## ✅ Demo data loaded into ${agency.name}`,
  '',
  `${days} days of numbers (${since} to ${until}). The daily sync keeps them up to date.`,
  '',
  '| Brand | Platform | Daily rows |',
  '| --- | --- | --- |',
  ...lines,
  '',
  'These brands are fictional and marked **Demo** in the dashboard. Run this workflow with "remove" to delete them.',
].join('\n'));
