// Starter benchmarks for Indonesia and a budget simulator.
// Every number has a source or is marked as an assumption. Ranges, never promises.
// Update this file as real client data comes in: that is the long-term advantage.

export const AS_OF = 'October 2026';

export const SOURCES = {
  adsumo: { name: 'Adsumo: Meta Ads CPC & CPM Indonesia (Oct 2026, >Rp25 bn/month spend)', url: 'https://adsumo.co/insights/biaya-meta-ads/cpc' },
  arfadia: { name: 'Arfadia: Indonesia Digital Marketing Benchmark 2026', url: 'https://www.arfadia.com/resources/digital-marketing-benchmark-indonesia-2026' },
  shopee: { name: 'Shopee Seller guide: minimum cost per click', url: 'https://shopee.co.id/inspirasi-shopee/rahasia-iklan-shopee-anti-boncos/' },
  wordstream: { name: 'WordStream / LocaliQ Facebook benchmarks by industry (US, 2024–25) via Orange MonkE', url: 'https://orangemonke.com/blogs/facebook-ads-benchmarks/' },
  triplewhale: { name: 'Triple Whale TikTok benchmarks by industry (2025) via Influee', url: 'https://influee.co/blog/tiktok-ads-benchmarks' },
  assumption: { name: 'Assumption: no reliable public figure; adjust with your own data', url: null },
};

// Platform baselines for Indonesia. [low, high]
// cpc: cost per click in IDR. cvr: share of clicks that buy. leadCvr: share of clicks that leave contact details.
export const PLATFORMS = {
  meta: {
    name: 'Meta',
    cpc: { range: [1100, 1800], source: 'adsumo', note: 'Most weekly averages Oct 2025–Oct 2026; Oct 2026 average Rp1.594' },
    cpm: { range: [20000, 28500], source: 'adsumo', note: 'Oct 2026 average Rp28.090' },
    cvr: { range: [0.02, 0.05], source: 'arfadia', note: 'Meta Ads conversion rate 2–5%' },
    leadCvr: { range: [0.10, 0.15], source: 'arfadia', note: 'Facebook lead form conversion 10–15%' },
    roas: { likely: 1.8, range: [1.0, 3.5], source: 'arfadia', note: 'Blended paid social ROAS 1.8× in Indonesia; spread around it is an assumption' },
  },
  tiktok: {
    name: 'TikTok',
    cpm: { range: [15000, 30000], source: 'arfadia', note: 'In-feed cost per 1,000 views' },
    ctr: { range: [0.006, 0.0177], source: 'triplewhale', note: 'Industry medians 0.57–0.73%, platform median 1.77%' },
    roas: { likely: 2.2, range: [1.0, 4.0], source: 'triplewhale', note: 'Platform median ROAS 2.21× (2025); spread around it is an assumption' },
  },
  shopee: {
    name: 'Shopee',
    cpc: { range: [400, 1200], source: 'assumption', note: 'Shopee minimum bid is Rp150–400; competitive keywords cost more' },
    roas: { likely: 4.2, range: [2.0, 7.0], source: 'arfadia', note: 'Marketplace ads ROAS 4.2× (Shopee + Tokopedia); spread around it is an assumption' },
  },
};

// Industry adjustments relative to an average advertiser, plus a default order value (assumption, editable).
// click: relative click-through vs average (from WordStream industry CTRs). roas: modest adjustment (assumption).
export const INDUSTRIES = {
  beauty: {
    name: 'Beauty & skincare', aov: 120000, click: 1.15, roas: 1.1,
    split: { tiktok: 0.45, shopee: 0.35, meta: 0.20 },
    advice: [
      'Video sells beauty: put most budget on TikTok (GMV Max) and Shopee search.',
      'Use Meta mainly to retarget people who visited or watched, where it converts best.',
      'Creator reviews (Spark Ads) usually beat brand-made videos.',
    ],
    warnings: ['Avoid medical claims ("menyembuhkan jerawat") and before/after images: all three platforms may reject them.'],
  },
  fashion: {
    name: 'Fashion & apparel', aov: 180000, click: 0.85, roas: 1.0,
    split: { shopee: 0.40, tiktok: 0.35, meta: 0.25 },
    advice: [
      'Shopee search captures people already looking for the item: start there.',
      'TikTok LIVE works well for new collections and flash sales.',
      'On Meta, catalog ads that show products people viewed recover lost buyers.',
    ],
    warnings: [],
  },
  food: {
    name: 'Food & beverage', aov: 70000, click: 1.1, roas: 0.9,
    split: { shopee: 0.45, tiktok: 0.35, meta: 0.20 },
    advice: [
      'Low order values make cheap clicks essential: Shopee search usually wins.',
      'Bundles and free-shipping thresholds raise order value and improve ROAS.',
      'For a physical outlet, Meta ads to people nearby (radius targeting) bring walk-ins.',
    ],
    warnings: ['Health claims on food and supplements ("menurunkan gula darah") need registration and are often rejected.'],
  },
  automotive: {
    name: 'Automotive (parts & service)', aov: 350000, click: 0.7, roas: 0.9,
    split: { meta: 0.50, shopee: 0.40, tiktok: 0.10 },
    advice: [
      'Buyers compare before purchasing: Meta Click-to-WhatsApp turns interest into a conversation.',
      'Spare parts sell through Shopee search by exact part name and car model.',
      'Workshops and services should target by location, not by interest.',
    ],
    warnings: [],
  },
  health: {
    name: 'Health & medical', aov: 150000, click: 0.6, roas: 0.85,
    split: { meta: 0.45, shopee: 0.40, tiktok: 0.15 },
    advice: [
      'For clinics and services, Meta lead forms or WhatsApp collect bookings.',
      'For registered health products, Shopee search reaches people with intent.',
    ],
    warnings: [
      'Strictly regulated on every platform: prescription medicines cannot be advertised.',
      'Products may need BPOM registration, and claims like "cures" or "guaranteed" get rejected.',
      'Meta limits targeting for health topics, so expect broader audiences.',
    ],
  },
  electronics: {
    name: 'Electronics & gadgets', aov: 600000, click: 1.0, roas: 0.85,
    split: { shopee: 0.50, meta: 0.25, tiktok: 0.25 },
    advice: [
      'Buyers search by model name: Shopee search ads on exact product names work best.',
      'Higher prices mean longer decisions; retargeting on Meta helps close the sale.',
    ],
    warnings: [],
  },
  home: {
    name: 'Home & living', aov: 250000, click: 0.85, roas: 1.0,
    split: { shopee: 0.45, tiktok: 0.30, meta: 0.25 },
    advice: [
      'Show the product in a real room: video on TikTok and carousels on Meta.',
      'Shopee search captures buyers with a specific need ("rak dinding minimalis").',
    ],
    warnings: [],
  },
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Simulate one platform for a budget (IDR). Returns { low, likely, high } for each output.
// Clicks come from cost per click. Sales come from ROAS anchored on published platform medians,
// so results stay realistic across order values. Leads (Meta only) come from lead-form conversion.
export function simulatePlatform(platformKey, industryKey, budget, { aov, goal = 'sales' } = {}) {
  const p = PLATFORMS[platformKey];
  const ind = INDUSTRIES[industryKey];
  const orderValue = aov ?? ind.aov;

  let cpcLow, cpcHigh;
  if (p.cpc) {
    [cpcLow, cpcHigh] = p.cpc.range.map((c) => c / ind.click);
  } else {
    const [cpmLow, cpmHigh] = p.cpm.range;
    const [ctrLow, ctrHigh] = p.ctr.range.map((c) => c * ind.click);
    cpcLow = cpmLow / 1000 / ctrHigh;
    cpcHigh = cpmHigh / 1000 / ctrLow;
  }
  const mid = (a, b) => Math.sqrt(a * b);
  const clicks = { low: budget / cpcHigh, high: budget / cpcLow };
  clicks.likely = mid(clicks.low, clicks.high);
  const out = {
    platform: platformKey, budget, goal,
    clicks: round(clicks),
    costPerClick: { low: cpcLow, high: cpcHigh, likely: mid(cpcLow, cpcHigh) },
  };

  if (goal === 'leads' || goal === 'traffic') {
    const [lo, hi] = goal === 'leads' && p.leadCvr ? p.leadCvr.range : [1, 1];
    out.results = round({ low: clicks.low * lo, likely: clicks.likely * mid(lo, hi), high: clicks.high * hi });
  } else {
    const roas = {
      low: p.roas.range[0] * ind.roas,
      likely: p.roas.likely * ind.roas,
      high: p.roas.range[1] * ind.roas,
    };
    out.roas = roas;
    out.sales = round({ low: budget * roas.low, likely: budget * roas.likely, high: budget * roas.high }, -3);
    out.results = round({ low: out.sales.low / orderValue, likely: out.sales.likely / orderValue, high: out.sales.high / orderValue });
  }
  out.costPerResult = {
    low: out.results.high ? budget / out.results.high : NaN,
    likely: out.results.likely ? budget / out.results.likely : NaN,
    high: out.results.low ? budget / out.results.low : NaN,
  };
  return out;
}

function round(r, digits = 0) {
  const f = 10 ** -digits;
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v / f) * f]));
}

// Normalise a split over the chosen platforms so it sums to 1.
export function normaliseSplit(split, platforms) {
  const picked = platforms.filter((p) => (split[p] ?? 0) > 0);
  const total = sum(picked.map((p) => split[p]));
  if (!total) return Object.fromEntries(platforms.map((p) => [p, 1 / platforms.length]));
  return Object.fromEntries(platforms.map((p) => [p, (split[p] ?? 0) / total]));
}

// Whole plan: budget across platforms. Totals add up platform ranges (a conservative way to combine them).
export function simulatePlan({ industry, budget, platforms, split, aov }) {
  const shares = normaliseSplit(split ?? INDUSTRIES[industry].split, platforms);
  const rows = platforms
    .filter((p) => shares[p] > 0)
    .map((p) => ({ ...simulatePlatform(p, industry, budget * shares[p], { aov }), share: shares[p] }));
  const add = (key) => ({
    low: sum(rows.map((r) => r[key].low)), likely: sum(rows.map((r) => r[key].likely)), high: sum(rows.map((r) => r[key].high)),
  });
  const total = { budget, clicks: add('clicks'), results: add('results'), sales: add('sales') };
  total.roas = { low: total.sales.low / budget, likely: total.sales.likely / budget, high: total.sales.high / budget };
  return { industry, shares, rows, total };
}
