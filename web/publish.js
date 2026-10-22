// Publishing connectors for campaigns built in the dashboard.
// `dummy`: simulates Meta's Marketing API (no real ad is created). Used until write access is approved.
// `live`:  will call a server-side endpoint that creates the campaign on Meta as PAUSED (next step).

const OBJECTIVES = {
  sales: { meta: 'OUTCOME_SALES', optimization: 'OFFSITE_CONVERSIONS', label: 'Sales' },
  traffic: { meta: 'OUTCOME_TRAFFIC', optimization: 'LINK_CLICKS', label: 'Website visits' },
  leads: { meta: 'OUTCOME_LEADS', optimization: 'LEAD_GENERATION', label: 'Leads (form)' },
  whatsapp: { meta: 'OUTCOME_ENGAGEMENT', optimization: 'CONVERSATIONS', label: 'WhatsApp chats' },
};
export const GOALS = OBJECTIVES;

const jakartaMidnight = (date) => (date ? `${date}T00:00:00+0700` : undefined);

// The three objects Meta needs (campaign -> ad set -> ad), exactly as they would be sent. Everything starts PAUSED.
export function metaPayload(req) {
  const s = req.settings ?? {};
  const o = OBJECTIVES[req.objective];
  // Live publishing must swap city names for Meta city keys (Targeting Search API) before sending.
  const geo = s.cities?.length
    ? { cities: s.cities.map((name) => ({ name, radius: 25, distance_unit: 'kilometer' })) }
    : { countries: ['ID'] };
  return {
    campaign: {
      name: req.name,
      objective: o.meta,
      status: 'PAUSED',
      buying_type: 'AUCTION',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    },
    adset: {
      name: `${req.name} – ad set`,
      daily_budget: Math.round(req.daily_budget),
      billing_event: 'IMPRESSIONS',
      optimization_goal: o.optimization,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      start_time: jakartaMidnight(req.start_date),
      end_time: req.end_date ? `${req.end_date}T23:59:59+0700` : undefined,
      destination_type: req.objective === 'whatsapp' ? 'WHATSAPP' : undefined,
      targeting: {
        geo_locations: geo,
        age_min: s.ageMin ?? 18,
        age_max: s.ageMax ?? 65,
        genders: s.gender === 'women' ? [2] : s.gender === 'men' ? [1] : undefined,
        publisher_platforms: s.placements ?? ['facebook', 'instagram'],
      },
      status: 'PAUSED',
    },
    ad: {
      name: `${req.name} – ad`,
      status: 'PAUSED',
      creative: {
        primary_text: s.primaryText,
        headline: s.headline,
        destination: req.objective === 'whatsapp' ? { whatsapp: s.whatsapp } : { link: s.url },
      },
    },
  };
}

// Simulated Meta API: same steps and ids shape, with a short delay. Never touches Meta.
export async function publishDummy(req) {
  const payload = metaPayload(req);
  const id = () => `dummy_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await new Promise((r) => setTimeout(r, 900));
  return {
    publish_mode: 'dummy',
    external_ids: { campaign_id: id(), adset_id: id(), ad_id: id(), status: 'PAUSED', payload },
  };
}

// Checks a draft before saving or publishing. Returns { field: message }.
export function validate(req) {
  const e = {};
  const s = req.settings ?? {};
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  if (!req.brand_id) e.brand = 'Choose a brand.';
  if (!req.name?.trim()) e.name = 'Give the campaign a name.';
  if (!(req.daily_budget >= 10000)) e.daily_budget = 'Enter a daily budget of at least Rp 10.000.';
  if (!req.start_date) e.start_date = 'Choose a start date.';
  else if (req.start_date < today) e.start_date = 'The start date cannot be in the past.';
  if (req.end_date && req.start_date && req.end_date < req.start_date) e.end_date = 'The end date must be after the start date.';
  if (!(s.placements?.length)) e.placements = 'Choose at least one placement.';
  if ((s.ageMin ?? 18) > (s.ageMax ?? 65)) e.age = 'Minimum age must be below maximum age.';
  if (!s.primaryText?.trim()) e.primaryText = 'Write the text people will see above the ad.';
  if (req.objective === 'whatsapp') {
    if (!/^(\+?62|0)8\d{7,12}$/.test((s.whatsapp ?? '').replace(/[\s-]/g, ''))) e.whatsapp = 'Enter a WhatsApp number like 0812 3456 7890.';
  } else {
    try {
      const u = new URL(s.url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch { e.url = 'Enter the full web address, starting with https://'; }
  }
  return e;
}
