// "Create campaign" view: build a Meta campaign, see its estimate, save as draft, publish (dummy connector for now).
import { INDUSTRIES, simulatePlatform } from './shared/benchmarks.mjs';
import { GOALS, LIVE_GOALS, metaPayload, publishDummy, validate } from './publish.js';
import { el, rp, rpFull, count, dateLabel, parseRupiah } from './format.js';
import { jakartaDate, isDemo } from './shared/mock.mjs';

const CITIES = ['Jakarta', 'Bogor', 'Depok', 'Tangerang', 'Bekasi', 'Bandung', 'Surabaya', 'Semarang', 'Yogyakarta', 'Medan', 'Makassar', 'Denpasar'];
const GOAL_HELP = {
  sales: 'People who buy on your website or shop.',
  traffic: 'People who visit your website or product page.',
  leads: 'People who leave their name and number in a form.',
  whatsapp: 'People who start a WhatsApp chat with you.',
};

let draft = null;
let prefill = null;
let flash = '';

export function setCreatePrefill(p) { prefill = p; draft = null; }

function blankDraft(ctx) {
  const brand = ctx.brands[0];
  return {
    id: undefined,
    agency_id: ctx.agencyId,
    brand_id: brand?.id ?? '',
    ad_account_id: null,
    platform: 'meta',
    name: '',
    objective: 'sales',
    daily_budget: 100000,
    start_date: jakartaDate(1),
    end_date: jakartaDate(30),
    settings: { cities: [], ageMin: 18, ageMax: 65, gender: 'all', placements: ['facebook', 'instagram'], primaryText: '', headline: '', url: '', whatsapp: '', industry: null },
    status: 'draft',
  };
}

export async function renderCreate(root, ctx) {
  // ctx: { agencyId, brands:[{id,name,industry,accounts}], listRequests, saveRequest, deleteRequest, previewMode }
  if (!draft) {
    draft = blankDraft(ctx);
    if (prefill) {
      if (prefill.daily_budget) draft.daily_budget = prefill.daily_budget;
      if (prefill.industry) draft.settings.industry = prefill.industry;
      const match = ctx.brands.find((b) => b.id === prefill.brand_id)
        ?? ctx.brands.find((b) => b.industry === prefill.industry);
      if (match) draft.brand_id = match.id;
      prefill = null;
    }
  }
  root.replaceChildren();
  const errors = {};
  const form = el('form', { class: 'create-form', novalidate: true, onsubmit: (e) => e.preventDefault() });
  const side = el('aside', { class: 'create-side', 'aria-live': 'polite' });
  const list = el('section', { class: 'block', 'aria-labelledby': 'created-title' });
  root.append(
    el('div', { class: 'view-head' },
      el('h1', { text: draft.id ? 'Edit campaign draft' : 'Create a Meta campaign' }),
      el('p', { class: 'muted', text: 'Set it up once here. When you publish, the campaign is created on Meta as paused, so nothing spends until you switch it on.' })),
    el('div', { class: 'connector-note', role: 'note' },
      el('b', { text: 'Test mode.' }), ' Publishing uses a simulated Meta connection: no real ad is created and nothing is charged. Live publishing comes once Meta write access is set up.'),
    el('div', { class: 'create-grid' }, form, side),
    list,
  );

  const brandOf = () => ctx.brands.find((b) => b.id === draft.brand_id);
  const metaAccount = () => brandOf()?.accounts.find((a) => a.platform === 'meta');

  // ---------- 1. Brand and goal ----------
  const brandSel = el('select', { id: 'c-brand' }, ...ctx.brands.map((b) => el('option', { value: b.id, text: b.name })));
  brandSel.value = draft.brand_id;
  const accountNote = el('p', { class: 'hint' });
  brandSel.addEventListener('change', () => { draft.brand_id = brandSel.value; suggestName(); refresh(); });

  const goals = el('div', { class: 'goal-cards', role: 'radiogroup', 'aria-label': 'Goal' },
    ...Object.entries(GOALS).map(([k, g]) => {
      const input = el('input', { type: 'radio', name: 'goal', value: k, id: `goal-${k}`, checked: draft.objective === k });
      input.addEventListener('change', () => { draft.objective = k; suggestName(); render1(); refresh(); });
      return el('label', { class: 'goal', for: `goal-${k}` }, input, el('span', { class: 'goal-name', text: g.label }), el('span', { class: 'goal-help', text: GOAL_HELP[k] }));
    }));

  const nameIn = el('input', { id: 'c-name', value: draft.name, maxlength: 200, autocomplete: 'off' });
  nameIn.addEventListener('input', () => { draft.name = nameIn.value; nameIn.dataset.touched = '1'; refreshSide(); });
  function suggestName() {
    if (nameIn.dataset.touched && draft.name) return;
    const month = new Date().toLocaleDateString('id-ID', { month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
    draft.name = `${brandOf()?.name ?? 'Campaign'} – ${GOALS[draft.objective].label} – ${month}`;
    nameIn.value = draft.name;
  }
  if (!draft.name) suggestName();

  // ---------- 2. Budget and schedule ----------
  const budgetIn = el('input', { id: 'c-budget', inputmode: 'numeric', value: rpFull(draft.daily_budget).replace('Rp ', ''), autocomplete: 'off' });
  budgetIn.addEventListener('input', () => { draft.daily_budget = parseRupiah(budgetIn.value) || 0; refreshSide(); });
  budgetIn.addEventListener('blur', () => { if (draft.daily_budget) budgetIn.value = rpFull(draft.daily_budget).replace('Rp ', ''); });
  const startIn = el('input', { id: 'c-start', type: 'date', value: draft.start_date, min: jakartaDate(0) });
  const endIn = el('input', { id: 'c-end', type: 'date', value: draft.end_date ?? '' });
  startIn.addEventListener('change', () => { draft.start_date = startIn.value; refreshSide(); });
  endIn.addEventListener('change', () => { draft.end_date = endIn.value || null; refreshSide(); });

  // ---------- 3. Audience ----------
  const s = draft.settings;
  const allId = el('input', { type: 'radio', name: 'where', id: 'where-all', checked: !s.cities.length });
  const someId = el('input', { type: 'radio', name: 'where', id: 'where-some', checked: !!s.cities.length });
  const cityChips = el('div', { class: 'chips', hidden: !s.cities.length },
    ...CITIES.map((c) => el('button', { type: 'button', class: 'chip', text: c, 'aria-pressed': String(s.cities.includes(c)),
      onclick: (e) => {
        s.cities = s.cities.includes(c) ? s.cities.filter((x) => x !== c) : [...s.cities, c];
        e.currentTarget.setAttribute('aria-pressed', String(s.cities.includes(c)));
        refreshSide();
      } })));
  allId.addEventListener('change', () => { s.cities = []; cityChips.hidden = true; [...cityChips.children].forEach((b) => b.setAttribute('aria-pressed', 'false')); refreshSide(); });
  someId.addEventListener('change', () => { cityChips.hidden = false; });
  const ageMin = el('input', { id: 'c-agemin', type: 'number', min: 18, max: 65, value: s.ageMin });
  const ageMax = el('input', { id: 'c-agemax', type: 'number', min: 18, max: 65, value: s.ageMax });
  ageMin.addEventListener('change', () => { s.ageMin = Number(ageMin.value) || 18; });
  ageMax.addEventListener('change', () => { s.ageMax = Number(ageMax.value) || 65; });
  const genderSel = el('select', { id: 'c-gender' },
    el('option', { value: 'all', text: 'Everyone' }), el('option', { value: 'women', text: 'Women' }), el('option', { value: 'men', text: 'Men' }));
  genderSel.value = s.gender;
  genderSel.addEventListener('change', () => { s.gender = genderSel.value; });
  const placements = el('div', { class: 'checks' }, ...[['facebook', 'Facebook'], ['instagram', 'Instagram']].map(([k, label]) => {
    const box = el('input', { type: 'checkbox', id: `pl-${k}`, checked: s.placements.includes(k) });
    box.addEventListener('change', () => { s.placements = box.checked ? [...new Set([...s.placements, k])] : s.placements.filter((x) => x !== k); });
    return el('label', { for: `pl-${k}`, class: 'check' }, box, label);
  }));

  // ---------- 4. Ad ----------
  const textIn = el('textarea', { id: 'c-text', rows: 3, maxlength: 600, text: s.primaryText });
  textIn.value = s.primaryText;
  const textCount = el('span', { class: 'hint' });
  const countText = () => { textCount.textContent = `${textIn.value.length} characters. Around 125 or fewer shows without "See more".`; };
  textIn.addEventListener('input', () => { s.primaryText = textIn.value; countText(); });
  countText();
  const headIn = el('input', { id: 'c-head', value: s.headline, maxlength: 80, autocomplete: 'off' });
  headIn.addEventListener('input', () => { s.headline = headIn.value; });
  const imgIn = el('input', { id: 'c-img', value: s.imageUrl ?? '', type: 'url', placeholder: 'https://…/photo.jpg', autocomplete: 'off' });
  imgIn.addEventListener('input', () => { s.imageUrl = imgIn.value.trim(); });
  const destWrap = el('div');
  function render1() {
    destWrap.replaceChildren();
    if (draft.objective === 'whatsapp') {
      const wa = el('input', { id: 'c-wa', value: s.whatsapp, inputmode: 'tel', placeholder: '0812 3456 7890', autocomplete: 'off' });
      wa.addEventListener('input', () => { s.whatsapp = wa.value; });
      destWrap.append(field('WhatsApp number', wa, errSlot('whatsapp')));
    } else {
      const url = el('input', { id: 'c-url', value: s.url, type: 'url', placeholder: 'https://', autocomplete: 'off' });
      url.addEventListener('input', () => { s.url = url.value; });
      destWrap.append(field(draft.objective === 'leads' ? 'Website (for the form\'s privacy link)' : 'Where the ad leads to', url, errSlot('url')));
    }
  }

  // ---------- assemble ----------
  const errSlots = {};
  function errSlot(key) { const p = el('p', { class: 'err', id: `err-${key}`, role: 'alert' }); errSlots[key] = p; return p; }
  function field(label, control, ...extra) {
    return el('div', { class: 'field' }, el('label', { for: control.id, text: label }), control, ...extra);
  }
  render1();

  const saveBtn = el('button', { type: 'button', class: 'btn-ghost', text: 'Save draft' });
  const publishBtn = el('button', { type: 'button', class: 'btn-primary', text: 'Review and publish' });
  const newBtn = el('button', { type: 'button', class: 'btn-link', text: 'Start a new campaign', hidden: !draft.id,
    onclick: () => { draft = null; renderCreate(root, ctx); } });
  const formMsg = el('p', { class: 'form-msg', role: 'status' });
  const flashEl = flash ? el('div', { class: 'flash', role: 'status', text: flash }) : null;
  flash = '';
  if (flashEl) root.querySelector('.view-head').after(flashEl);

  form.append(
    section('Brand and goal',
      field('Brand', brandSel, accountNote, errSlot('brand')),
      el('fieldset', { class: 'field' }, el('legend', { text: 'What should this campaign get you?' }), goals),
      field('Campaign name', nameIn, errSlot('name'))),
    section('Budget and schedule',
      el('div', { class: 'row3' },
        field('Daily budget (Rp)', budgetIn, errSlot('daily_budget')),
        field('Start', startIn, errSlot('start_date')),
        field('End (optional)', endIn, errSlot('end_date')))),
    section('Who sees it',
      el('fieldset', { class: 'field' }, el('legend', { text: 'Location' }),
        el('div', { class: 'checks' },
          el('label', { for: 'where-all', class: 'check' }, allId, 'All of Indonesia'),
          el('label', { for: 'where-some', class: 'check' }, someId, 'Selected cities')),
        cityChips),
      el('div', { class: 'row3' }, field('Age from', ageMin), field('Age to', ageMax, errSlot('age')), field('Gender', genderSel)),
      el('fieldset', { class: 'field' }, el('legend', { text: 'Show on' }), placements, errSlot('placements'))),
    section('The ad',
      field('Main text', textIn, textCount, errSlot('primaryText')),
      field('Headline (optional)', headIn),
      field('Image link (optional)', imgIn, el('p', { class: 'hint', text: 'A public https link to a product photo. If empty, Meta tries to use the image from your web page.' }), errSlot('imageUrl')),
      destWrap),
    el('div', { class: 'actions' }, publishBtn, saveBtn, newBtn),
    formMsg,
  );

  function section(title, ...kids) { return el('section', { class: 'form-section' }, el('h2', { text: title }), ...kids); }

  function showErrors(e) {
    for (const [k, slot] of Object.entries(errSlots)) slot.textContent = e[k] ?? '';
    const first = Object.keys(e)[0];
    if (first) form.querySelector(`#err-${first}`)?.previousElementSibling?.focus?.();
  }

  saveBtn.addEventListener('click', async () => {
    const e = validate(draft);
    // Drafts may be incomplete; only block on fields the database requires.
    const blocking = ['brand', 'name', 'daily_budget', 'start_date', 'end_date'].filter((k) => e[k]);
    showErrors(Object.fromEntries(blocking.map((k) => [k, e[k]])));
    if (blocking.length) return;
    await persist('draft', 'Draft saved.');
  });

  publishBtn.addEventListener('click', () => {
    const e = validate(draft);
    showErrors(e);
    if (Object.keys(e).length) { formMsg.textContent = 'Fix the highlighted fields to publish.'; return; }
    openReview();
  });

  async function persist(status, msg, extra = {}) {
    formMsg.textContent = 'Saving…';
    try {
      const est = estimate();
      const saved = await ctx.saveRequest({
        id: draft.id, agency_id: ctx.agencyId, brand_id: draft.brand_id, ad_account_id: metaAccount()?.id ?? null,
        platform: 'meta', name: draft.name.trim(), objective: draft.objective, daily_budget: draft.daily_budget,
        start_date: draft.start_date, end_date: draft.end_date || null, settings: draft.settings,
        estimate: est ? { days: est.days, clicks: est.sim.clicks, results: est.sim.results, industry: est.industry } : null,
        status, ...extra,
      });
      draft = { ...draft, id: saved.id };
      newBtn.hidden = false;
      formMsg.textContent = msg;
      await renderList();
      return saved;
    } catch (err) {
      formMsg.textContent = err.message;
      throw err;
    }
  }

  // ---------- review + publish dialog ----------
  function openReview() {
    const acc = metaAccount();
    const realAccount = acc && !isDemo(acc.external_id);
    const liveOk = !ctx.previewMode && realAccount && LIVE_GOALS.includes(draft.objective);
    const liveWhyNot = ctx.previewMode ? 'Not available in preview.'
      : !acc ? 'This brand has no Meta ad account connected.'
        : !realAccount ? 'Demo brands can only publish in test mode.'
          : !LIVE_GOALS.includes(draft.objective) ? 'Real publishing supports Website visits and Sales for now.' : '';
    let mode = 'test';

    const dlg = el('dialog', { class: 'review', 'aria-labelledby': 'review-title' });
    const est = estimate();
    const confirmBtn = el('button', { type: 'button', class: 'btn-primary' });
    const cancelBtn = el('button', { type: 'button', class: 'btn-ghost', text: 'Back to editing', onclick: () => dlg.close() });
    const msg = el('p', { class: 'form-msg', role: 'status' });
    const note = el('p', { class: 'connector-note' });
    const modeBox = el('fieldset', { class: 'field mode' }, el('legend', { text: 'Publish to' }),
      ...[['test', 'Test mode', 'Simulated. Nothing is sent to Meta.'], ['live', 'Meta, as paused', liveOk ? 'Creates the real campaign in Ads Manager, switched off.' : liveWhyNot]].map(([v, label, help]) => {
        const input = el('input', { type: 'radio', name: 'mode', value: v, id: `mode-${v}`, checked: v === 'test', disabled: v === 'live' && !liveOk });
        input.addEventListener('change', () => { mode = v; syncMode(); });
        return el('label', { class: 'goal' + (v === 'live' && !liveOk ? ' disabled' : ''), for: `mode-${v}` }, input, el('span', { class: 'goal-name', text: label }), el('span', { class: 'goal-help', text: help }));
      }));
    function syncMode() {
      confirmBtn.textContent = mode === 'live' ? 'Publish to Meta as paused' : 'Publish in test mode';
      note.textContent = mode === 'live'
        ? 'The campaign is created on your real Meta ad account, switched off. Nothing is shown to anyone or charged until you switch it on in Ads Manager.'
        : 'Test mode: simulated Meta connection. No real ad is created.';
    }
    syncMode();

    dlg.append(
      el('h2', { id: 'review-title', text: 'Review before publishing' }),
      el('dl', { class: 'summary' },
        ...pair('Brand', brandOf()?.name),
        ...pair('Ad account', acc ? (isDemo(acc.external_id) ? `${acc.name} (demo)` : acc.name ?? 'Meta ad account') : 'None connected'),
        ...pair('Goal', GOALS[draft.objective].label),
        ...pair('Budget', `${rpFull(draft.daily_budget)} a day${est ? `, about ${rpFull(draft.daily_budget * est.days)} in total` : ''}`),
        ...pair('Dates', `${dateLabel(draft.start_date)}${draft.end_date ? ` to ${dateLabel(draft.end_date)}` : ', no end date'}`),
        ...pair('Audience', `${draft.settings.cities.length ? draft.settings.cities.join(', ') : 'All of Indonesia'}, age ${draft.settings.ageMin}–${draft.settings.ageMax}, ${{ all: 'everyone', women: 'women', men: 'men' }[draft.settings.gender]}`),
        ...pair('Shows on', draft.settings.placements.map((p) => p[0].toUpperCase() + p.slice(1)).join(' and ')),
        ...pair('Status after publishing', 'Paused: switch it on in Meta Ads Manager when ready'),
      ),
      modeBox,
      el('details', {}, el('summary', { text: 'What will be sent to Meta' }), el('pre', { text: JSON.stringify(metaPayload(draft), null, 2) })),
      note,
      el('div', { class: 'actions' }, confirmBtn, cancelBtn), msg,
    );
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true; cancelBtn.disabled = true;
      try {
        if (mode === 'live') {
          msg.textContent = 'Creating the campaign on Meta… this takes a few seconds.';
          const saved = await persist('draft', 'Saved.');
          await ctx.publishLive(saved.id);
          flash = `"${draft.name}" was created on Meta as paused. Open it from the list below to check it in Ads Manager.`;
        } else {
          msg.textContent = 'Publishing (test mode)…';
          const result = await publishDummy(draft);
          await persist('published', 'Published as paused (test mode).', { publish_mode: result.publish_mode, external_ids: result.external_ids, error: null });
          flash = `"${draft.name}" was published as paused (test mode). It is listed under Campaigns created here.`;
        }
        dlg.close();
        draft = null;
        renderCreate(root, ctx);
      } catch (err) {
        msg.textContent = err.message;
        confirmBtn.disabled = false; cancelBtn.disabled = false;
        renderList();
      }
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }
  function pair(k, v) { return [el('dt', { text: k }), el('dd', { text: v ?? '–' })]; }

  // ---------- estimate side panel ----------
  const indSel = el('select', { id: 'c-industry' }, ...Object.entries(INDUSTRIES).map(([k, v]) => el('option', { value: k, text: v.name })));
  indSel.addEventListener('change', () => { draft.settings.industry = indSel.value; refreshSide(); });

  function estimate() {
    const industry = brandOf()?.industry ?? draft.settings.industry ?? 'beauty';
    if (!(draft.daily_budget > 0) || !draft.start_date) return null;
    const days = draft.end_date && draft.end_date >= draft.start_date
      ? Math.round((Date.parse(draft.end_date) - Date.parse(draft.start_date)) / 864e5) + 1 : 30;
    const goal = draft.objective === 'sales' ? 'sales' : draft.objective === 'traffic' ? 'traffic' : 'leads';
    const sim = simulatePlatform('meta', industry, draft.daily_budget * days, { goal });
    return { days, industry, goal, sim };
  }

  function refreshSide() {
    side.replaceChildren();
    const b = brandOf();
    const acc = metaAccount();
    accountNote.textContent = !b ? '' : acc
      ? `Meta ad account: ${isDemo(acc.external_id) ? `${acc.name} (demo)` : 'connected'}.`
      : `${b.name} has no Meta ad account connected yet. You can still prepare and test-publish this campaign.`;
    const est = estimate();
    side.append(el('h2', { text: 'Estimate' }));
    if (!b?.industry) {
      indSel.value = draft.settings.industry ?? 'beauty';
      side.append(el('div', { class: 'field' }, el('label', { for: 'c-industry', text: 'Industry' }), indSel));
    } else {
      side.append(el('p', { class: 'muted small', text: `Based on ${INDUSTRIES[b.industry]?.name.toLowerCase() ?? b.industry} benchmarks for Meta in Indonesia.` }));
    }
    if (!est) { side.append(el('p', { class: 'muted', text: 'Enter a daily budget and start date to see an estimate.' })); return; }
    const resultWord = { sales: 'orders', traffic: 'website visits', leads: draft.objective === 'whatsapp' ? 'WhatsApp chats' : 'leads' }[est.goal];
    const r = est.sim;
    side.append(
      el('p', { class: 'est-period', text: `Over ${est.days} days${draft.end_date ? '' : ' (no end date, showing 30)'}: ${rpFull(draft.daily_budget * est.days)}` }),
      stat(`Likely ${resultWord}`, count(r.results.likely), `${count(r.results.low)}–${count(r.results.high)}`),
      stat('Clicks', count(r.clicks.likely), `${count(r.clicks.low)}–${count(r.clicks.high)}`),
      stat(`Cost per ${resultWord.replace(/s$/, '').replace('WhatsApp chat', 'chat')}`, rpFull(r.costPerResult.likely), `${rp(r.costPerResult.low)}–${rp(r.costPerResult.high)}`),
    );
    if (r.sales) side.append(stat('Sales', rp(r.sales.likely), `${rp(r.sales.low)}–${rp(r.sales.high)}`));
    if (draft.objective === 'whatsapp') side.append(el('p', { class: 'hint', text: 'WhatsApp chats are estimated like lead forms (an assumption).' }));
    const ind = INDUSTRIES[est.industry];
    if (ind?.warnings.length) side.append(el('p', { class: 'warn small', text: ind.warnings[0] }));
  }
  function stat(label, value, range) {
    return el('div', { class: 'est' }, el('div', { class: 'est-label', text: label }), el('div', { class: 'est-value', text: value }), el('div', { class: 'est-range', text: `range ${range}` }));
  }
  function refresh() { refreshSide(); }

  // ---------- campaigns created here ----------
  async function renderList() {
    list.replaceChildren(el('div', { class: 'block-head' }, el('h2', { id: 'created-title', text: 'Campaigns created here' })));
    let rows;
    try { rows = await ctx.listRequests(); } catch (err) { list.append(el('p', { class: 'err', text: err.message })); return; }
    if (!rows.length) { list.append(el('p', { class: 'muted', text: 'Nothing yet. Campaigns you save or publish appear here.' })); return; }
    const table = el('table');
    table.append(el('thead', {}, el('tr', {}, ...['Campaign', 'Brand', 'Goal', 'Daily budget', 'Dates', 'Status', ''].map((h, i) => el('th', { class: i < 3 || i > 4 ? 'left' : undefined, text: h })))));
    const body = el('tbody');
    for (const r of rows) {
      const brand = ctx.brands.find((b) => b.id === r.brand_id);
      const statusEl = r.status === 'published'
        ? el('span', { class: 'pill pill-ok', text: r.publish_mode === 'dummy' ? 'Published, paused (test)' : 'Published, paused' })
        : r.status === 'failed' ? el('span', { class: 'pill pill-err', text: 'Failed' })
          : el('span', { class: 'pill', text: 'Draft' });
      const actions = el('td', { class: 'left actions-cell' });
      if (r.status === 'draft' || r.status === 'failed') {
        actions.append(
          el('button', { type: 'button', class: 'btn-link', text: 'Edit', onclick: () => { draft = { ...structuredClone(r), daily_budget: Number(r.daily_budget) }; renderCreate(root, ctx); window.scrollTo({ top: 0 }); } }),
          r.status === 'draft' && el('button', { type: 'button', class: 'btn-link danger', text: 'Delete', onclick: async () => {
            if (!confirm(`Delete the draft "${r.name}"?`)) return;
            try { await ctx.deleteRequest(r.id); renderList(); } catch (err) { formMsg.textContent = err.message; }
          } }));
      } else if (r.external_ids?.ads_manager_url) {
        actions.append(el('a', { href: r.external_ids.ads_manager_url, target: '_blank', rel: 'noopener', class: 'btn-link', text: 'Open in Ads Manager' }));
      } else if (r.external_ids?.campaign_id) {
        actions.append(el('span', { class: 'muted small', text: `Test ID ${r.external_ids.campaign_id}` }));
      }
      const nameCell = el('td', { class: 'left cmp-name', text: r.name });
      if (r.status === 'failed' && r.error) nameCell.append(el('div', { class: 'err small', text: `Meta said: ${r.error}` }));
      body.append(el('tr', {},
        nameCell,
        el('td', { class: 'left', text: brand?.name ?? '–' }),
        el('td', { class: 'left', text: GOALS[r.objective]?.label ?? r.objective }),
        el('td', { text: rpFull(Number(r.daily_budget)) }),
        el('td', { text: `${dateLabel(r.start_date)}${r.end_date ? ` – ${dateLabel(r.end_date)}` : ''}` }),
        el('td', { class: 'left' }, statusEl),
        actions));
    }
    table.append(body);
    list.append(el('div', { class: 'table-wrap created' }, table));
  }

  refreshSide();
  renderList();
}
