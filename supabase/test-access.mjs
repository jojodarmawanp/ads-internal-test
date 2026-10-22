// Applies all migrations to an in-memory Postgres (PGlite) and checks who can read and change what.
// Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = new URL('..', import.meta.url).pathname;
const db = new PGlite();
// Minimal Supabase stand-in: auth schema, roles, default grants.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);
for (const f of ['0001_init.sql', '0002_campaign_builder.sql']) {
  await db.exec(readFileSync(`${repo}/supabase/migrations/${f}`, 'utf8').replace('create extension if not exists pgcrypto;', ''));
  console.log('applied', f);
}
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com');
  insert into agencies (id,name) values ('aaaaaaaa-0000-0000-0000-000000000001','Agency A'),('aaaaaaaa-0000-0000-0000-000000000002','Agency B');
  insert into agency_members values ('aaaaaaaa-0000-0000-0000-000000000001','${A}','owner'),('aaaaaaaa-0000-0000-0000-000000000002','${B}','owner');
  insert into brands (id,agency_id,name) values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Brand A'),('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000002','Brand B');
  insert into ad_accounts (id,brand_id,platform,external_id) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','meta','111'),('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','meta','222');
  insert into connections values ('cccccccc-0000-0000-0000-000000000001','SECRET',null,now());
`);
const as = async (user, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
  try { const r = await db.query(sql); return { ok: true, rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec('reset role'); }
};
const check = (label, cond) => { console.log(cond ? 'PASS' : 'FAIL', label); if (!cond) process.exitCode = 1; };
const base = (agency, brand, acc) => `insert into campaign_requests (agency_id,brand_id,ad_account_id,name,objective,daily_budget,start_date) values ('${agency}','${brand}',${acc ? `'${acc}'` : 'null'},'Test','sales',50000,'2026-10-25') returning id`;

check('A creates request in own agency', (await as(A, base('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001'))).ok);
check('A cannot create in agency B', !(await as(A, base('aaaaaaaa-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002',null))).ok);
check('A cannot attach brand B to own agency', !(await as(A, base('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',null))).ok);
check('A cannot use ad account of another brand', !(await as(A, base('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002'))).ok);
check('B cannot see A requests', (await as(B, 'select * from campaign_requests')).rows.length === 0);
check('A sees own request', (await as(A, 'select * from campaign_requests')).rows.length === 1);
const pub = await as(A, `update campaign_requests set status='published', publish_mode='dummy', external_ids='{"campaign_id":"dummy_1"}' where true`);
check('A publishes own request', pub.ok && pub.n === 1);
check('A cannot delete published request', (await as(A, 'delete from campaign_requests')).n === 0);
const ind = await as(A, `update brands set industry='beauty' where id='bbbbbbbb-0000-0000-0000-000000000001'`);
check('A sets industry on own brand', ind.ok && ind.n === 1);
check('A cannot rename brand', !(await as(A, `update brands set name='x' where id='bbbbbbbb-0000-0000-0000-000000000001'`)).ok);
check('A cannot set industry on brand B', (await as(A, `update brands set industry='x' where id='bbbbbbbb-0000-0000-0000-000000000002'`)).n === 0);
check('A cannot read tokens', (await as(A, 'select * from connections')).rows.length === 0);
check('A reads brand_daily view', (await as(A, 'select * from brand_daily')).ok);
check('budget must be positive', !(await as(A, `insert into campaign_requests (agency_id,brand_id,name,objective,daily_budget,start_date) values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','x','sales',0,'2026-10-25')`)).ok);
