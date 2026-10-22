// "Plan budget" view: industry advice + cost simulation across Meta, TikTok and Shopee.
import { INDUSTRIES, PLATFORMS, SOURCES, AS_OF, simulatePlan, normaliseSplit } from './shared/benchmarks.mjs';
import { el, rp, rpFull, ratio, count, parseRupiah } from './format.js';

const KEYS = ['tiktok', 'shopee', 'meta'];
const PRESETS = [1e6, 5e6, 10e6, 25e6];

const state = {
  industry: 'beauty',
  budget: 5e6,
  aov: null,          // null = industry default
  on: { tiktok: true, shopee: true, meta: true },
  split: { ...INDUSTRIES.beauty.split },
  brandId: '',
};

export function renderPlan(root, ctx) {
  // ctx: { brands: [{id,name,industry}], setIndustry(brandId, key), goCreate(prefill) }
  root.replaceChildren();
  const form = el('form', { class: 'plan-form', onsubmit: (e) => e.preventDefault(), 'aria-label': 'Plan inputs' });
  const results = el('div', { class: 'plan-results', 'aria-live': 'polite' });
  root.append(el('div', { class: 'view-head' },
    el('h1', { text: 'Plan an ad budget' }),
    el('p', { class: 'muted', text: 'See what a monthly budget could bring in across Meta, TikTok and Shopee, with advice for your industry.' }),
  ), el('div', { class: 'plan-grid' }, form, results));

  // Brand (optional) — picks up and saves the brand's industry
  const brandSel = el('select', { id: 'plan-brand' },
    el('option', { value: '', text: 'Just exploring' }),
    ...ctx.brands.map((b) => el('option', { value: b.id, text: b.name })));
  brandSel.value = state.brandId;
  const savedNote = el('p', { class: 'hint', 'aria-live': 'polite' });

  const indSel = el('select', { id: 'plan-industry' },
    ...Object.entries(INDUSTRIES).map(([k, v]) => el('option', { value: k, text: v.name })));
  indSel.value = state.industry;

  const budgetIn = el('input', { id: 'plan-budget', inputmode: 'numeric', value: rpFull(state.budget).replace('Rp ', ''), autocomplete: 'off' });
  const presets = el('div', { class: 'chips' }, ...PRESETS.map((v) => el('button', {
    type: 'button', class: 'chip', text: rp(v), 'aria-pressed': String(state.budget === v),
    onclick: () => { state.budget = v; budgetIn.value = rpFull(v).replace('Rp ', ''); update(); },
  })));
  const aovIn = el('input', { id: 'plan-aov', inputmode: 'numeric', autocomplete: 'off' });
  const aovHint = el('p', { class: 'hint' });

  const splitRows = KEYS.map((k) => {
    const box = el('input', { type: 'checkbox', id: `on-${k}`, checked: state.on[k] });
    const pct = el('input', { type: 'number', min: 0, max: 100, step: 5, id: `pct-${k}`, 'aria-label': `${PLATFORMS[k].name} share in percent` });
    box.addEventListener('change', () => { state.on[k] = box.checked; update(); });
    pct.addEventListener('change', () => { state.split[k] = Math.max(0, Number(pct.value) || 0) / 100; update(); });
    return { k, box, pct, row: el('div', { class: 'split-row' },
      el('label', { for: `on-${k}`, class: 'split-name' }, box, el('i', { class: `key key-${k}` }), PLATFORMS[k].name),
      el('span', { class: 'pct' }, pct, '%')) };
  });
  const resetSplit = el('button', { type: 'button', class: 'btn-link', text: 'Use recommended split',
    onclick: () => { state.split = { ...INDUSTRIES[state.industry].split }; update(); } });

  form.append(
    field('Brand', brandSel, savedNote),
    field('Industry', indSel),
    field('Monthly budget (Rp)', budgetIn, presets),
    field('Average order value (Rp)', aovIn, aovHint),
    el('fieldset', { class: 'field' }, el('legend', { text: 'Platforms and budget split' }), ...splitRows.map((r) => r.row), resetSplit),
  );

  brandSel.addEventListener('change', () => {
    state.brandId = brandSel.value;
    const b = ctx.brands.find((x) => x.id === state.brandId);
    savedNote.textContent = '';
    if (b?.industry && INDUSTRIES[b.industry]) {
      setIndustry(b.industry);
      savedNote.textContent = `Using ${b.name}'s industry.`;
    } else if (b) {
      savedNote.textContent = `${b.name} has no industry yet. Pick one below and it will be saved.`;
    }
    update();
  });
  indSel.addEventListener('change', async () => {
    setIndustry(indSel.value);
    update();
    const b = ctx.brands.find((x) => x.id === state.brandId);
    if (b && b.industry !== indSel.value) {
      try { await ctx.setIndustry(b.id, indSel.value); b.industry = indSel.value; savedNote.textContent = `Saved as ${b.name}'s industry.`; }
      catch (err) { savedNote.textContent = err.message; }
    }
  });
  budgetIn.addEventListener('input', () => { const v = parseRupiah(budgetIn.value); if (v > 0) { state.budget = v; update(false); } });
  budgetIn.addEventListener('blur', () => { budgetIn.value = rpFull(state.budget).replace('Rp ', ''); });
  aovIn.addEventListener('input', () => { const v = parseRupiah(aovIn.value); state.aov = v > 0 ? v : null; update(false); });

  function setIndustry(k) {
    state.industry = k;
    indSel.value = k;
    state.split = { ...INDUSTRIES[k].split };
    state.aov = null;
  }

  function update(syncInputs = true) {
    const ind = INDUSTRIES[state.industry];
    const aov = state.aov ?? ind.aov;
    if (syncInputs || document.activeElement !== aovIn) aovIn.value = state.aov ? rpFull(state.aov).replace('Rp ', '') : '';
    aovIn.placeholder = rpFull(ind.aov).replace('Rp ', '');
    aovHint.textContent = `Leave empty to use a typical ${ind.name.toLowerCase()} order of ${rpFull(ind.aov)} (an assumption).`;
    for (const b of presets.children) b.setAttribute('aria-pressed', String(parseRupiah(b.textContent) === state.budget));

    const platforms = KEYS.filter((k) => state.on[k]);
    const shares = normaliseSplit(state.split, platforms);
    for (const r of splitRows) {
      r.box.checked = state.on[r.k];
      r.pct.disabled = !state.on[r.k];
      if (document.activeElement !== r.pct) r.pct.value = state.on[r.k] ? Math.round((shares[r.k] ?? 0) * 100) : '';
    }
    renderResults(results, platforms.length ? simulatePlan({ industry: state.industry, budget: state.budget, platforms, split: shares, aov }) : null, ind, aov, ctx);
  }
  update();
}

function field(label, control, ...extra) {
  const id = control.id;
  return el('div', { class: 'field' }, el('label', { for: id, text: label }), control, ...extra);
}

function rangeText(r, f) { return `${f(r.low)} – ${f(r.high)}`; }

function renderResults(root, plan, ind, aov, ctx) {
  root.replaceChildren();
  if (!plan) {
    root.append(el('p', { class: 'empty', text: 'Turn on at least one platform to see an estimate.' }));
    return;
  }
  const t = plan.total;
  root.append(
    el('p', { class: 'plan-headline' },
      `With ${rp(t.budget)} a month in ${ind.name.toLowerCase()}, expect around `,
      el('b', { text: `${count(t.results.likely)} orders` }), ` and `, el('b', { text: rp(t.sales.likely) }), ' in sales.'),
    el('p', { class: 'subline', text: `Likely ROAS ${ratio(t.roas.likely)}. A realistic range is ${count(t.results.low)}–${count(t.results.high)} orders (ROAS ${ratio(t.roas.low)}–${ratio(t.roas.high)}), depending on your product, price, reviews and creative.` }),
  );

  // ROAS range per platform: likely point + low–high whisker
  root.append(el('section', { class: 'block' },
    el('div', { class: 'block-head' }, el('h2', { text: 'Expected ROAS by platform' }),
      el('p', { class: 'muted small', text: 'Dot = likely, line = realistic range' })),
    roasChart(plan.rows, Math.min(680, Math.max(300, root.clientWidth - 44)))));

  // Table
  const table = el('table', { class: 'plan-table' });
  table.append(el('thead', {}, el('tr', {},
    ...['Platform', 'Budget', 'Clicks', 'Orders', 'Sales', 'ROAS', 'Cost per order'].map((h, i) => el('th', { class: i === 0 ? 'left' : undefined, text: h })))));
  const body = el('tbody');
  const cell = (main, sub) => el('td', {}, el('div', { class: 'v', text: main }), el('div', { class: 'r', text: sub }));
  for (const r of plan.rows) {
    body.append(el('tr', {},
      el('td', { class: 'left' }, el('span', { class: 'plats' }, el('span', {}, el('i', { class: `key key-${r.platform}` }), PLATFORMS[r.platform].name)),
        el('div', { class: 'r', text: `${Math.round(r.share * 100)}% of budget` })),
      el('td', {}, el('div', { class: 'v', text: rp(r.budget) })),
      cell(count(r.clicks.likely), rangeText(r.clicks, count)),
      cell(count(r.results.likely), rangeText(r.results, count)),
      cell(rp(r.sales.likely), rangeText(r.sales, rp)),
      cell(ratio(r.roas.likely), rangeText(r.roas, ratio)),
      cell(rpFull(r.costPerResult.likely), rangeText({ low: r.costPerResult.low, high: r.costPerResult.high }, rp)),
    ));
  }
  body.append(el('tr', { class: 'total' },
    el('td', { class: 'left', text: 'Total' }),
    el('td', {}, el('div', { class: 'v', text: rp(t.budget) })),
    cell(count(t.clicks.likely), rangeText(t.clicks, count)),
    cell(count(t.results.likely), rangeText(t.results, count)),
    cell(rp(t.sales.likely), rangeText(t.sales, rp)),
    cell(ratio(t.roas.likely), rangeText(t.roas, ratio)),
    el('td', {}, el('div', { class: 'v', text: rpFull(t.budget / t.results.likely) })),
  ));
  table.append(body);
  root.append(el('section', { class: 'block' }, el('div', { class: 'block-head' }, el('h2', { text: 'Estimate per platform' }),
    el('p', { class: 'muted small', text: `Average order ${rpFull(aov)}` })), el('div', { class: 'table-wrap' }, table)));

  // Advice
  const advice = el('section', { class: 'block advice' },
    el('h2', { text: `Advice for ${ind.name.toLowerCase()}` }),
    el('ul', {}, ...ind.advice.map((a) => el('li', { text: a }))));
  if (ind.warnings.length) {
    advice.append(el('div', { class: 'warn', role: 'note' },
      el('p', { class: 'warn-title' }, warnIcon(), 'Ad policy risks'),
      el('ul', {}, ...ind.warnings.map((w) => el('li', { text: w })))));
  }
  const metaRow = plan.rows.find((r) => r.platform === 'meta');
  if (metaRow) {
    advice.append(el('button', { type: 'button', class: 'btn-primary', text: `Create a Meta campaign with ${rp(metaRow.budget / 30)} a day`,
      onclick: () => ctx.goCreate({ daily_budget: Math.round(metaRow.budget / 30 / 1000) * 1000, industry: plan.industry, brand_id: state.brandId || null }) }));
  }
  root.append(advice);

  // Method + sources
  const used = new Set(['adsumo', 'arfadia', 'shopee', 'wordstream', 'triplewhale', 'assumption']);
  root.append(el('details', { class: 'method' },
    el('summary', { text: 'How this estimate is made' }),
    el('p', { text: `Clicks come from typical cost per click in Indonesia. Sales come from typical ROAS per platform, adjusted slightly for your industry. Orders are sales divided by your average order value. Figures as of ${AS_OF}.` }),
    el('ul', {}, ...Object.entries(PLATFORMS).flatMap(([, p]) => Object.entries(p)
      .filter(([k]) => k !== 'name')
      .map(([k, v]) => el('li', {}, `${p.name} ${label(k)}: ${fmtRange(k, v.range)}${v.likely ? ` (likely ${ratio(v.likely)}×)` : ''}. ${v.note}. `, srcLink(v.source)))),
    ),
    el('p', { class: 'muted small' }, 'Sources: ', ...[...used].filter((k) => SOURCES[k].url).flatMap((k, i) => [i ? ', ' : '', el('a', { href: SOURCES[k].url, target: '_blank', rel: 'noopener', text: SOURCES[k].name })]), '.'),
  ));
}

const label = (k) => ({ cpc: 'cost per click', cpm: 'cost per 1,000 views', cvr: 'conversion', leadCvr: 'lead-form conversion', ctr: 'click rate', roas: 'ROAS' }[k] ?? k);
function fmtRange(k, [a, b]) {
  if (k === 'cpc' || k === 'cpm') return `${rpFull(a)}–${rpFull(b)}`;
  if (k === 'roas') return `${ratio(a)}–${ratio(b)}×`;
  return `${(a * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}–${(b * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}
function srcLink(key) {
  const s = SOURCES[key];
  return s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener', text: 'Source' }) : el('em', { text: 'Assumption' });
}
function warnIcon() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('width', '16'); s.setAttribute('height', '16'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M8 1.5l7 12.5H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v4M8 12v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  return s;
}

// Dot + whisker per platform on one ROAS axis.
function roasChart(rows, W = 640) {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const rowH = 40, m = { l: 70, r: 44, t: 8, b: 28 };
  const H = m.t + rows.length * rowH + m.b;
  const max = Math.ceil(Math.max(...rows.map((r) => r.roas.high), 4));
  const x = (v) => m.l + (v / max) * (W - m.l - m.r);
  const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Expected ROAS range per platform', class: 'roas-chart' });
  const step = max > 8 || W < 420 ? 2 : 1;
  for (let v = 0; v <= max; v += step) {
    svg.append(mk('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, stroke: 'var(--rule)' }));
    const t = mk('text', { x: x(v), y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-3)' }); t.textContent = `${v}×`; svg.append(t);
  }
  // break-even line at ROAS 1
  svg.append(mk('line', { x1: x(1), x2: x(1), y1: m.t, y2: H - m.b, stroke: 'var(--ink-3)', 'stroke-dasharray': '3 3' }));
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    const c = `var(--${r.platform})`;
    const lab = mk('text', { x: 0, y: y + 4, 'font-size': 13, 'font-weight': 600, fill: 'var(--ink)' }); lab.textContent = PLATFORMS[r.platform].name; svg.append(lab);
    const g = mk('g', { tabindex: 0, role: 'img', 'aria-label': `${PLATFORMS[r.platform].name}: likely ROAS ${ratio(r.roas.likely)}, range ${ratio(r.roas.low)} to ${ratio(r.roas.high)}` });
    g.append(mk('line', { x1: x(r.roas.low), x2: x(r.roas.high), y1: y, y2: y, stroke: c, 'stroke-width': 2, 'stroke-linecap': 'round' }));
    g.append(mk('line', { x1: x(r.roas.low), x2: x(r.roas.low), y1: y - 6, y2: y + 6, stroke: c, 'stroke-width': 2 }));
    g.append(mk('line', { x1: x(r.roas.high), x2: x(r.roas.high), y1: y - 6, y2: y + 6, stroke: c, 'stroke-width': 2 }));
    g.append(mk('circle', { cx: x(r.roas.likely), cy: y, r: 6, fill: c, stroke: 'var(--surface)', 'stroke-width': 2 }));
    const v = mk('text', { x: x(r.roas.high) + 10, y: y + 4, 'font-size': 12, fill: 'var(--ink-2)' }); v.textContent = `${ratio(r.roas.likely)}×`;
    g.append(v);
    svg.append(g);
  });
  const be = mk('text', { x: x(1) + 4, y: m.t + 10, 'font-size': 11, fill: 'var(--ink-3)' }); be.textContent = 'sales = spend'; svg.append(be);
  return el('div', { class: 'chart' }, svg);
}
