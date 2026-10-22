// Mock connector: realistic, repeatable demo data for Meta, TikTok and Shopee.
// Same output shape as the real Meta connector (sync/meta.mjs parseInsightRow),
// so the rest of the platform cannot tell the difference except via the "demo_" id.
// Runs in Node (sync job) and in the browser (dashboard preview mode).

export const DEMO_PREFIX = 'demo_';

// Each campaign: base daily spend (IDR), ROAS level, cost model, avg order value.
// cpm = cost per 1,000 impressions, ctr = click-through rate.
export const DEMO_BRANDS = [
  {
    slug: 'kopi-senja', name: 'Kopi Senja',
    accounts: {
      shopee: [
        { id: 'c1', name: 'Iklan Pencarian – kopi susu literan', spend: 180000, roas: 6.2, cpm: 9000, ctr: 0.034, aov: 85000 },
        { id: 'c2', name: 'Iklan Produk Serupa – bundling', spend: 120000, roas: 4.8, cpm: 7000, ctr: 0.026, aov: 110000 },
        { id: 'c3', name: 'Iklan Toko – brand search', spend: 60000, roas: 8.5, cpm: 11000, ctr: 0.041, aov: 95000 },
      ],
      meta: [
        { id: 'c1', name: 'Sales – Lookalike pembeli 1%', spend: 150000, roas: 3.1, cpm: 28000, ctr: 0.012, aov: 120000 },
        { id: 'c2', name: 'Retargeting – pengunjung 30 hari', spend: 70000, roas: 5.4, cpm: 34000, ctr: 0.018, aov: 115000 },
      ],
    },
  },
  {
    slug: 'glowra', name: 'Glowra Skincare',
    accounts: {
      tiktok: [
        { id: 'c1', name: 'GMV Max – Product (serum best seller)', spend: 650000, roas: 4.4, cpm: 18000, ctr: 0.016, aov: 140000 },
        { id: 'c2', name: 'GMV Max – LIVE malam', spend: 400000, roas: 5.6, cpm: 22000, ctr: 0.021, aov: 160000 },
        { id: 'c3', name: 'Spark Ads – review kreator', spend: 220000, roas: 2.6, cpm: 15000, ctr: 0.013, aov: 135000 },
      ],
      shopee: [
        { id: 'c1', name: 'Iklan Pencarian – serum niacinamide', spend: 260000, roas: 5.1, cpm: 10000, ctr: 0.031, aov: 125000 },
        { id: 'c2', name: 'Iklan Produk Serupa – toner', spend: 140000, roas: 3.9, cpm: 8000, ctr: 0.024, aov: 98000 },
      ],
      meta: [
        { id: 'c1', name: 'Advantage+ Sales – semua produk', spend: 300000, roas: 3.3, cpm: 31000, ctr: 0.011, aov: 150000 },
        { id: 'c2', name: 'Click-to-WhatsApp – konsultasi kulit', spend: 90000, roas: 2.2, cpm: 26000, ctr: 0.015, aov: 210000 },
      ],
    },
  },
  {
    slug: 'batik-ayu', name: 'Batik Ayu',
    accounts: {
      meta: [
        { id: 'c1', name: 'Sales – Interest fashion wanita', spend: 260000, roas: 1.4, cpm: 33000, ctr: 0.009, aov: 320000 },
        { id: 'c2', name: 'Catalog – produk dilihat', spend: 110000, roas: 2.7, cpm: 29000, ctr: 0.014, aov: 290000 },
      ],
      tiktok: [
        { id: 'c1', name: 'GMV Max – Product (kemeja batik)', spend: 210000, roas: 2.1, cpm: 17000, ctr: 0.012, aov: 260000 },
      ],
    },
  },
  {
    slug: 'snackit', name: 'Snackit',
    accounts: {
      shopee: [
        { id: 'c1', name: 'Iklan Pencarian – keripik pedas', spend: 140000, roas: 5.8, cpm: 8500, ctr: 0.036, aov: 55000 },
        { id: 'c2', name: 'Iklan Produk Serupa – paket hemat', spend: 90000, roas: 4.1, cpm: 6500, ctr: 0.028, aov: 70000 },
      ],
      tiktok: [
        { id: 'c1', name: 'GMV Max – Product (keripik)', spend: 300000, roas: 4.9, cpm: 14000, ctr: 0.019, aov: 60000 },
        { id: 'c2', name: 'GMV Max – LIVE jualan sore', spend: 180000, roas: 6.1, cpm: 16000, ctr: 0.023, aov: 75000 },
      ],
    },
  },
];

export const PLATFORM_NAMES = { meta: 'Meta', tiktok: 'TikTok', shopee: 'Shopee' };

export const demoExternalId = (platform, slug) => `${DEMO_PREFIX}${platform}_${slug}`;
export const isDemo = (externalId = '') => externalId.startsWith(DEMO_PREFIX);

// Every demo ad account as a flat list.
export function demoAccounts() {
  return DEMO_BRANDS.flatMap((b) => Object.keys(b.accounts).map((platform) => ({
    brand_slug: b.slug, brand_name: b.name, platform,
    external_id: demoExternalId(platform, b.slug),
    name: `${b.name} – ${PLATFORM_NAMES[platform]}`,
  })));
}

// ---------- deterministic randomness ----------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (r, spread) => 1 + (r() * 2 - 1) * spread;

// ---------- dates (Asia/Jakarta) ----------
export function jakartaDate(offsetDays = 0, from = new Date()) {
  const d = new Date(from.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(d); // YYYY-MM-DD
}
export function dateRange(since, until) {
  const out = [];
  for (let t = Date.parse(since + 'T00:00:00Z'); t <= Date.parse(until + 'T00:00:00Z'); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// Seasonality typical for Indonesian e-commerce.
function dayFactor(platform, date) {
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDate(), month = d.getUTCMonth() + 1, dow = d.getUTCDay();
  let spend = 1, roas = 1;
  if (dow === 0 || dow === 6) { spend *= 1.08; roas *= 1.05; }        // weekend
  if (day >= 25 || day <= 2) { spend *= 1.22; roas *= 1.12; }        // payday (gajian)
  if (day === month) {                                                // double date: 9.9, 10.10, 11.11 ...
    const marketplace = platform !== 'meta';
    spend *= marketplace ? 2.4 : 1.4; roas *= marketplace ? 1.35 : 1.1;
  }
  return { spend, roas };
}

function campaignDay(platform, brandSlug, c, date) {
  const r = rng(hash(`${platform}|${brandSlug}|${c.id}|${date}`));
  const f = dayFactor(platform, date);
  const spend = Math.round(c.spend * f.spend * noise(r, 0.18) / 100) * 100;
  const roas = c.roas * f.roas * noise(r, 0.22);
  const impressions = Math.round(spend / (c.cpm * noise(r, 0.12)) * 1000);
  const clicks = Math.round(impressions * c.ctr * noise(r, 0.15));
  const revenue = Math.round(spend * roas / 100) * 100;
  const purchases = Math.max(0, Math.round(revenue / (c.aov * noise(r, 0.1))));
  return { spend, impressions, clicks, purchases, revenue };
}

// ---------- connector interface (same as sync/meta.mjs) ----------
function lookup(externalId) {
  const m = externalId.match(/^demo_(meta|tiktok|shopee)_(.+)$/);
  if (!m) throw new Error(`Not a demo account: ${externalId}`);
  const brand = DEMO_BRANDS.find((b) => b.slug === m[2]);
  const campaigns = brand?.accounts[m[1]];
  if (!campaigns) throw new Error(`Unknown demo account: ${externalId}`);
  return { platform: m[1], brand, campaigns };
}

export async function fetchAccountInfo({ accountId }) {
  const { platform, brand } = lookup(accountId);
  return { name: `${brand.name} – ${PLATFORM_NAMES[platform]}`, currency: 'IDR', timezone: 'Asia/Jakarta' };
}

// Rows for every campaign and day in [since, until]. Defaults to the last 7 complete days.
export async function fetchDailyInsights({ accountId, since = jakartaDate(-7), until = jakartaDate(-1) }) {
  return dailyRows(accountId, since, until);
}

export function dailyRows(accountId, since, until) {
  const { platform, brand, campaigns } = lookup(accountId);
  return dateRange(since, until).flatMap((date) => campaigns.map((c) => ({
    campaign_external_id: `${accountId}_${c.id}`,
    campaign_name: c.name,
    date,
    ...campaignDay(platform, brand.slug, c, date),
  })));
}
