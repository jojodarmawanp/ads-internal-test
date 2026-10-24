import { previewMode, currentUser, sendLoginLink, signOut, onAuthChange, loadData, setBrandIndustry, listRequests, saveRequest, deleteRequest, publishLive } from './data.js';
import { renderPlan } from './plan.js';
import { renderCreate, setCreatePrefill } from './create.js';
import { renderStackedBars } from './chart.js';
import { jakartaDate, dateRange, isDemo, PLATFORM_NAMES } from './shared/mock.mjs';

const $ = (id) => document.getElementById(id);
const PLATFORMS = ['meta', 'tiktok', 'shopee'];
const SERIES = PLATFORMS.map((key) => ({ key, name: PLATFORM_NAMES[key], color: `var(--${key})` }));

// ---------- formatting (Indonesian conventions) ----------
const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rp = (n) => `Rp\u00a0${compact.format(n).replace(' ', '\u00a0')}`;
const rpFull = (n) => `Rp\u00a0${whole.format(Math.round(n))}`;
const ratio = (n) => (Number.isFinite(n) ? one.format(n) : '–');
const pct = (n) => (Number.isFinite(n) ? `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n * 100)}%` : '–');
const shortDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ---------- state ----------
const state = {
  days: 30,
  platform: 'all',
  brandId: null,
  view: 'overview',
  target: 3,
  sort: { key: 'spend', dir: 'desc' },
  data: null,
};
try {
  const saved = JSON.parse(localStorage.getItem('ads-dash') || '{}');
  if ([7, 14, 30].includes(saved.days)) state.days = saved.days;
  if (saved.target > 0) state.target = saved.target;
} catch { /* storage unavailable */ }
const save = () => { try { localStorage.setItem('ads-dash', JSON.stringify({ days: state.days, target: state.target })); } catch { /* ignore */ } };

// ---------- aggregation ----------
const empty = () => ({ spend: 0, revenue: 0, clicks: 0, impressions: 0, purchases: 0 });
function add(t, m) { t.spend += m.spend; t.revenue += m.revenue; t.clicks += m.clicks; t.impressions += m.impressions; t.purchases += m.purchases; return t; }
const roas = (t) => (t.spend ? t.revenue / t.spend : NaN);
const cpc = (t) => (t.clicks ? t.spend / t.clicks : NaN);
const ctr = (t) => (t.impressions ? t.clicks / t.impressions : NaN);

function index(data) {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const campaigns = new Map(data.campaigns.map((c) => [c.id, { ...c, account: accounts.get(c.ad_account_id) }]));
  const brands = new Map();
  for (const a of data.accounts) {
    if (!a.brand) continue;
    const b = brands.get(a.brand.id) ?? { id: a.brand.id, name: a.brand.name, industry: a.brand.industry ?? null, accounts: [] };
    b.accounts.push(a);
    brands.set(b.id, b);
  }
  for (const b of brands.values()) b.demo = b.accounts.every((a) => isDemo(a.external_id));
  return { accounts, campaigns, brands };
}

function windows() {
  const until = jakartaDate(-1);
  const since = jakartaDate(-state.days);
  const prevUntil = jakartaDate(-state.days - 1);
  const prevSince = jakartaDate(-state.days * 2);
  return { since, until, prevSince, prevUntil };
}

function scopedRows(idx) {
  return state.data.metrics
    .map((m) => ({ ...m, campaign: idx.campaigns.get(m.campaign_id) }))
    .filter((m) => m.campaign?.account?.brand
      && (state.platform === 'all' || m.campaign.account.platform === state.platform)
      && (!state.brandId || m.campaign.account.brand.id === state.brandId));
}

// ---------- rendering ----------
function setSeg(groupId, attr, value) {
  for (const b of $(groupId).querySelectorAll('button')) {
    const on = b.dataset[attr] === String(value);
    b.setAttribute('aria-checked', on);
    b.tabIndex = on ? 0 : -1;
  }
}

function deltaHtml(cur, prev, goodWhenUp) {
  if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return '<span>no earlier data</span>';
  const d = (cur - prev) / Math.abs(prev);
  if (Math.abs(d) < 0.005) return '<span>no change</span>';
  const arrow = d > 0 ? '▲' : '▼';
  const cls = goodWhenUp === null ? '' : (d > 0) === goodWhenUp ? 'up' : 'down';
  return `<span class="${cls}">${arrow} ${whole.format(Math.abs(d * 100))}%</span> vs prior ${state.days}d`;
}

function status(r) {
  if (!Number.isFinite(r)) return { cls: '', label: 'No spend', icon: '' };
  if (r >= state.target) return { cls: 'good', label: 'On target', icon: '<path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' };
  if (r >= state.target * 0.7) return { cls: 'warning', label: 'Close to target', icon: '<path d="M8 3v6M8 12.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' };
  return { cls: 'critical', label: 'Below target', icon: '<path d="M8 3v9M4 8.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' };
}
function statusCell(td, r) {
  const s = status(r);
  td.innerHTML = s.icon ? `<span class="status ${s.cls}"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">${s.icon}</svg></span>` : '<span class="status"></span>';
  td.firstChild.append(document.createTextNode(s.label));
}

function syncText(accounts) {
  const err = accounts.find((a) => a.last_sync_error);
  if (err) return { text: 'Sync failed', title: err.last_sync_error, error: true };
  const times = accounts.map((a) => a.last_synced_at).filter(Boolean).sort();
  if (!times.length) return { text: 'Not synced yet' };
  const t = new Date(times[0]);
  const today = jakartaDate(0) === jakartaDate(0, t);
  const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  return { text: today ? `Today ${time}` : `${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })} ${time}` };
}

const tooltip = {
  el: $('tooltip'),
  show(day, total, ev, target) {
    const t = tooltip.el;
    t.replaceChildren();
    const head = document.createElement('div');
    head.className = 'tt-date';
    head.textContent = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    t.append(head);
    for (const s of [...SERIES].reverse()) {
      const v = day.values[s.key];
      if (!v) continue;
      const row = document.createElement('div');
      row.className = 'tt-row';
      const key = document.createElement('i'); key.style.background = s.color;
      const name = document.createElement('span'); name.textContent = s.name;
      const val = document.createElement('b'); val.textContent = rpFull(v);
      row.append(key, name, val);
      t.append(row);
    }
    const tot = document.createElement('div');
    tot.className = 'tt-row tt-total';
    tot.append(document.createElement('i'), Object.assign(document.createElement('span'), { textContent: 'Total' }),
      Object.assign(document.createElement('b'), { textContent: rpFull(total) }));
    t.append(tot);
    t.hidden = false;
    const r = ev?.clientX ? { x: ev.clientX, y: ev.clientY } : (() => { const b = target.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 40 }; })();
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = r.x + 14, y = r.y - h - 12;
    if (x + w > innerWidth - 8) x = r.x - w - 14;
    if (y < 8) y = r.y + 16;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${y}px`;
  },
  hide() { tooltip.el.hidden = true; },
};

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.brandId = p.get('brand');
  state.view = ['plan', 'create'].includes(p.get('view')) ? p.get('view') : 'overview';
}

function brandList(idx) {
  // Real brands first, then demo brands, each alphabetically.
  return [...idx.brands.values()].sort((a, b) => (a.demo - b.demo) || a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, name: b.name, demo: b.demo, industry: b.industry, accounts: b.accounts }));
}

function render() {
  if (!state.data) return;
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.view === state.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  $('view-overview').hidden = state.view !== 'overview';
  $('view-plan').hidden = state.view !== 'plan';
  $('view-create').hidden = state.view !== 'create';
  if (state.view !== 'overview') {
    const idx = index(state.data);
    $('crumb-agency').textContent = state.data.agencyName;
    $('crumb-agency').classList.remove('link');
    $('crumb-sep').hidden = true;
    $('crumb-brand').textContent = '';
    $('notice').hidden = !previewMode;
    if (previewMode) $('notice').innerHTML = '<strong>Preview.</strong> Every brand here is fictional demo data. Connect Supabase to see your real ad accounts.';
    const brands = brandList(idx);
    if (state.view === 'plan') {
      document.title = 'Plan budget · Ads overview';
      renderPlan($('view-plan'), {
        brands,
        setIndustry: async (id, ind) => { await setBrandIndustry(id, ind); const b = idx.brands.get(id); if (b) b.industry = ind; patchIndustry(id, ind); },
        goCreate: (p) => { setCreatePrefill(p); location.hash = 'view=create'; },
      });
    } else {
      document.title = 'Create campaign · Ads overview';
      renderCreate($('view-create'), { agencyId: state.data.agencyId, brands, listRequests, saveRequest, deleteRequest, publishLive, previewMode });
    }
    return;
  }
  const idx = index(state.data);
  if (state.brandId && !idx.brands.has(state.brandId)) state.brandId = null;
  const brand = state.brandId ? idx.brands.get(state.brandId) : null;
  const w = windows();
  const rows = scopedRows(idx);
  const cur = rows.filter((m) => m.date >= w.since && m.date <= w.until);
  const prev = rows.filter((m) => m.date >= w.prevSince && m.date <= w.prevUntil);
  const T = cur.reduce(add, empty());
  const P = prev.reduce(add, empty());

  // controls + crumbs
  setSeg('range', 'days', state.days);
  setSeg('platform', 'platform', state.platform);
  $('target').value = state.target;
  $('crumb-agency').textContent = state.data.agencyName;
  $('crumb-agency').classList.toggle('link', !!brand);
  $('crumb-sep').hidden = !brand;
  $('crumb-brand').textContent = brand ? brand.name : '';
  document.title = brand ? `${brand.name} · Ads overview` : 'Ads overview';

  // notice
  const anyDemo = [...idx.brands.values()].some((b) => b.demo);
  const notice = $('notice');
  if (previewMode) {
    notice.innerHTML = '<strong>Preview.</strong> Every brand here is fictional demo data. Connect Supabase to see your real ad accounts.';
  } else if (!idx.brands.size) {
    notice.innerHTML = '<strong>No ad accounts yet.</strong> Run the “Setup: connect Meta account” workflow on GitHub to connect your first one.';
  } else if (brand?.demo) {
    notice.innerHTML = '<strong>Demo brand.</strong> These numbers are fictional and only here to show how the dashboard works.';
  } else if (anyDemo && !brand) {
    notice.innerHTML = 'Brands marked <strong>Demo</strong> use fictional numbers. Remove them with the “Demo data” workflow when you no longer need them.';
  } else notice.innerHTML = '';
  notice.hidden = !notice.innerHTML;

  // headline sentence
  const yRows = rows.filter((m) => m.date === w.until);
  const Y = yRows.reduce(add, empty());
  const who = brand ? brand.name : `${idx.brands.size} brand${idx.brands.size === 1 ? '' : 's'}`;
  const plat = state.platform === 'all' ? '' : ` on ${PLATFORM_NAMES[state.platform]}`;
  const hl = $('headline');
  hl.replaceChildren();
  if (Y.spend > 0) {
    hl.append(`Yesterday, ${who} spent `, Object.assign(document.createElement('b'), { textContent: rp(Y.spend) }),
      `${plat} and brought back `, Object.assign(document.createElement('b'), { textContent: rp(Y.revenue) }), ' in sales.');
  } else {
    hl.textContent = `No ad spend yesterday${plat} for ${who}.`;
  }
  const units = brand
    ? [...new Set(cur.map((m) => m.campaign_id))].map((id) => cur.filter((m) => m.campaign_id === id).reduce(add, empty()))
    : [...idx.brands.keys()].map((id) => cur.filter((m) => m.campaign.account.brand.id === id).reduce(add, empty())).filter((t) => t.spend);
  const below = units.filter((t) => roas(t) < state.target).length;
  const unitWord = brand ? 'campaign' : 'brand';
  $('subline').textContent = T.spend
    ? `Last ${state.days} days: ROAS ${ratio(roas(T))} against your target of ${ratio(state.target)}. ` +
      (below ? `${below} ${unitWord}${below === 1 ? ' is' : 's are'} below target.` : `Every ${unitWord} is on or near target.`)
    : `Nothing spent in the last ${state.days} days.`;

  // KPIs
  const kpis = [
    ['Spend', rp(T.spend), rpFull(T.spend), deltaHtml(T.spend, P.spend, null)],
    ['Sales from ads', rp(T.revenue), rpFull(T.revenue), deltaHtml(T.revenue, P.revenue, true)],
    ['ROAS', ratio(roas(T)), 'Sales ÷ spend', deltaHtml(roas(T), roas(P), true)],
    ['Orders', whole.format(T.purchases), `${whole.format(T.purchases)} orders`, deltaHtml(T.purchases, P.purchases, true)],
    ['Cost per click', Number.isFinite(cpc(T)) ? rpFull(cpc(T)) : '–', 'Spend ÷ clicks', deltaHtml(cpc(T), cpc(P), false)],
    ['Click rate', pct(ctr(T)), 'Clicks ÷ impressions', deltaHtml(ctr(T), ctr(P), true)],
  ];
  const k = $('kpis');
  k.replaceChildren();
  for (const [label, value, title, delta] of kpis) {
    const d = document.createElement('div');
    d.className = 'kpi';
    d.innerHTML = `<div class="kpi-label"></div><div class="kpi-value"></div><div class="kpi-delta">${delta}</div>`;
    d.children[0].textContent = label;
    d.children[1].textContent = value;
    d.children[1].title = title;
    k.append(d);
  }

  // chart
  const series = state.platform === 'all' ? SERIES : SERIES.filter((s) => s.key === state.platform);
  const byDay = new Map(dateRange(w.since, w.until).map((d) => [d, { date: d, label: shortDate(d), values: {} }]));
  for (const m of cur) {
    const day = byDay.get(m.date);
    const p = m.campaign.account.platform;
    day.values[p] = (day.values[p] || 0) + m.spend;
  }
  const present = series.filter((s) => cur.some((m) => m.campaign.account.platform === s.key));
  const legend = $('legend');
  legend.replaceChildren();
  if (present.length > 1) {
    for (const s of present) {
      const span = document.createElement('span');
      span.innerHTML = `<i class="key key-${s.key}"></i>`;
      span.append(s.name);
      legend.append(span);
    }
  }
  $('chart-title').textContent = present.length === 1 ? `Spend per day on ${present[0].name}` : 'Spend per day';
  renderStackedBars($('chart'), { days: [...byDay.values()], series: present.length ? present : series, format: (v) => compact.format(v), formatFull: rpFull, tooltip });

  // table
  renderTable(idx, cur, brand);

  $('foot').textContent = 'Synced every morning at 06:17 WIB. Sales are what each platform reports; Meta, TikTok and Shopee each count sales their own way, so compare trends rather than exact totals.';
}

function renderTable(idx, cur, brand) {
  const table = $('table');
  let cols, rows;
  if (!brand) {
    $('table-title').textContent = 'Brands';
    $('table-note').textContent = 'Select a brand to see its campaigns.';
    cols = [
      { key: 'name', label: 'Brand', left: true },
      { key: 'platforms', label: 'Platforms', left: true, sort: false },
      { key: 'spend', label: 'Spend' },
      { key: 'revenue', label: 'Sales' },
      { key: 'roas', label: 'ROAS' },
      { key: 'status', label: 'Vs target', left: true, sort: false },
      { key: 'sync', label: 'Last sync', left: true, sort: false },
    ];
    rows = [...idx.brands.values()].map((b) => {
      const accounts = b.accounts.filter((a) => state.platform === 'all' || a.platform === state.platform);
      const t = cur.filter((m) => m.campaign.account.brand.id === b.id).reduce(add, empty());
      return { id: b.id, name: b.name, demo: b.demo, accounts, spend: t.spend, revenue: t.revenue, roas: roas(t) };
    }).filter((r) => r.accounts.length);
  } else {
    $('table-title').textContent = 'Campaigns';
    $('table-note').textContent = `${brand.name}, last ${state.days} days`;
    cols = [
      { key: 'name', label: 'Campaign', left: true },
      { key: 'platform', label: 'Platform', left: true },
      { key: 'spend', label: 'Spend' },
      { key: 'revenue', label: 'Sales' },
      { key: 'roas', label: 'ROAS' },
      { key: 'status', label: 'Vs target', left: true, sort: false },
      { key: 'clicks', label: 'Clicks' },
      { key: 'cpc', label: 'Cost per click' },
    ];
    const byCampaign = new Map();
    for (const m of cur) {
      const r = byCampaign.get(m.campaign_id) ?? { id: m.campaign_id, name: m.campaign.name, platform: m.campaign.account.platform, t: empty() };
      add(r.t, m);
      byCampaign.set(m.campaign_id, r);
    }
    rows = [...byCampaign.values()].map((r) => ({ ...r, spend: r.t.spend, revenue: r.t.revenue, roas: roas(r.t), clicks: r.t.clicks, cpc: cpc(r.t) }));
  }

  const { key, dir } = state.sort;
  const sortKey = cols.some((c) => c.key === key && c.sort !== false) ? key : 'spend';
  rows.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const r = typeof av === 'string' ? av.localeCompare(bv) : (Number.isFinite(av) ? av : -1) - (Number.isFinite(bv) ? bv : -1);
    return dir === 'asc' ? r : -r;
  });

  table.replaceChildren();
  const thead = table.createTHead().insertRow();
  for (const c of cols) {
    const th = document.createElement('th');
    if (c.left) th.className = 'left';
    if (c.sort === false) th.textContent = c.label;
    else {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      b.addEventListener('click', () => {
        state.sort = { key: c.key, dir: state.sort.key === c.key && state.sort.dir === 'desc' ? 'asc' : 'desc' };
        render();
      });
      th.append(b);
      if (c.key === sortKey) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
    }
    thead.append(th);
  }

  const body = table.createTBody();
  if (!rows.length) {
    const td = body.insertRow().insertCell();
    td.colSpan = cols.length;
    td.className = 'left muted';
    td.textContent = brand ? 'No campaign activity in this period.' : 'No brands for this platform.';
    return;
  }
  for (const r of rows) {
    const tr = body.insertRow();
    for (const c of cols) {
      const td = tr.insertCell();
      if (c.left) td.className = 'left';
      switch (c.key) {
        case 'name':
          if (!brand) {
            td.className = 'name';
            const a = document.createElement('a');
            a.href = `#brand=${encodeURIComponent(r.id)}`;
            a.textContent = r.name;
            td.append(a);
            if (r.demo) td.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: 'Demo' }));
          } else {
            td.className = 'cmp-name';
            td.textContent = r.name;
          }
          break;
        case 'platforms': {
          const wrap = document.createElement('span');
          wrap.className = 'plats';
          for (const p of PLATFORMS.filter((p) => r.accounts.some((a) => a.platform === p))) {
            const s = document.createElement('span');
            s.innerHTML = `<i class="key key-${p}"></i>`;
            s.append(PLATFORM_NAMES[p]);
            wrap.append(s);
          }
          td.append(wrap);
          break;
        }
        case 'platform': {
          td.innerHTML = `<span class="plats"><span><i class="key key-${r.platform}"></i></span></span>`;
          td.querySelector('.plats span').append(PLATFORM_NAMES[r.platform]);
          break;
        }
        case 'spend': case 'revenue':
          td.textContent = rp(r[c.key]);
          td.title = rpFull(r[c.key]);
          break;
        case 'roas': td.textContent = ratio(r.roas); break;
        case 'status': statusCell(td, r.roas); break;
        case 'clicks': td.textContent = whole.format(r.clicks); break;
        case 'cpc': td.textContent = Number.isFinite(r.cpc) ? rpFull(r.cpc) : '–'; break;
        case 'sync': {
          const s = syncText(r.accounts);
          td.textContent = s.text;
          if (s.title) td.title = s.title;
          if (s.error) td.classList.add('sync-err');
          break;
        }
      }
    }
    if (!brand) {
      tr.classList.add('clickable');
      tr.addEventListener('click', (e) => { if (e.target.tagName !== 'A') location.hash = `brand=${encodeURIComponent(r.id)}`; });
    }
  }
}

// ---------- events ----------
function bindSeg(id, attr, apply) {
  const group = $(id);
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) { apply(b.dataset[attr]); render(); }
  });
  group.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const buttons = [...group.querySelectorAll('button')];
    const i = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    apply(next.dataset[attr]); render(); next.focus();
  });
}
bindSeg('range', 'days', (v) => { state.days = Number(v); save(); });
bindSeg('platform', 'platform', (v) => { state.platform = v; });
$('target').addEventListener('change', (e) => {
  const v = Number(String(e.target.value).replace(',', '.'));
  if (v > 0) { state.target = v; save(); }
  render();
});
$('crumb-agency').addEventListener('click', () => { location.hash = ''; });
function patchIndustry(id, ind) { for (const a of state.data.accounts) if (a.brand?.id === id) a.brand.industry = ind; }
window.addEventListener('hashchange', () => { readHash(); state.sort = { key: 'spend', dir: 'desc' }; render(); window.scrollTo({ top: 0 }); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (state.view === 'overview') render(); }, 120); });
$('sign-out').addEventListener('click', async () => { await signOut(); location.hash = ''; location.reload(); });

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  const msg = $('login-msg');
  btn.disabled = true;
  msg.textContent = 'Sending…';
  try {
    await sendLoginLink($('email').value.trim());
    msg.textContent = 'Check your inbox and open the login link on this device.';
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- start ----------
async function start() {
  let user;
  try {
    user = await currentUser();
  } catch (err) {
    $('login').hidden = false;
    $('login-msg').textContent = `Could not reach the login service. Check your connection and reload. (${err.message})`;
    return;
  }
  if (!user) { $('login').hidden = false; $('app').hidden = true; return; }
  $('login').hidden = true;
  $('app').hidden = false;
  $('user-email').textContent = previewMode ? 'Preview' : user.email;
  $('sign-out').hidden = previewMode;
  readHash();
  for (const id of ['kpis', 'chart']) $(id).classList.add('loading');
  try {
    state.data = await loadData(jakartaDate(-60));
  } catch (err) {
    $('notice').hidden = false;
    $('notice').textContent = `Could not load data: ${err.message}`;
    return;
  } finally {
    for (const id of ['kpis', 'chart']) $(id).classList.remove('loading');
  }
  render();
}
onAuthChange((user) => { if (user && $('app').hidden) start(); });
start();
