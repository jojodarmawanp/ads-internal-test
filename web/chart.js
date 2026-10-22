// Stacked daily bars (one segment per platform) as plain SVG, with a per-day hover/focus tooltip.
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// Rounded top corners only (data end), square at the baseline side.
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/**
 * days: [{ date, label, values: { [seriesKey]: number } }]
 * series: [{ key, name, color }] in fixed order (bottom → top)
 */
export function renderStackedBars(container, { days, series, format, formatFull, tooltip }) {
  container.replaceChildren();
  const totals = days.map((d) => series.reduce((t, s) => t + (d.values[s.key] || 0), 0));
  if (!days.length || totals.every((t) => t === 0)) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No spend in this period yet. Numbers appear here after the next daily sync once ads are running.';
    container.append(p);
    return;
  }

  const W = Math.max(container.clientWidth, 320);
  const H = 260;
  const m = { top: 12, right: 8, bottom: 28, left: 56 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const max = niceMax(Math.max(...totals));
  const y = (v) => m.top + ih - (v / max) * ih;
  const step = iw / days.length;
  const bw = Math.max(Math.min(step * 0.68, 28), 3);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'list', 'aria-label': 'Daily ad spend by platform' });

  // grid + y labels (recessive)
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.append(el('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), stroke: 'var(--rule)', 'stroke-width': 1 }));
    const t = el('text', { x: m.left - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-3)' });
    t.textContent = format(v);
    svg.append(t);
  }

  // x labels: about 6 evenly spaced
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.min(7, Math.floor(iw / 72)))));
  days.forEach((d, i) => {
    if (i % every !== 0 && i !== days.length - 1) return;
    if (i === days.length - 1 && i % every !== 0 && i % every < every / 2) return;
    const t = el('text', { x: m.left + step * i + step / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-3)' });
    t.textContent = d.label;
    svg.append(t);
  });

  // bars
  days.forEach((d, i) => {
    const g = el('g', { class: 'col', tabindex: 0, role: 'listitem', 'aria-label': `${d.label}: ${formatFull(totals[i])}` });
    const x = m.left + step * i + (step - bw) / 2;
    // hit area = full column height and width (bigger than the mark)
    g.append(el('rect', { class: 'hit', x: m.left + step * i, y: m.top, width: step, height: ih, fill: 'transparent', rx: 4 }));
    let acc = 0;
    const visible = series.filter((s) => (d.values[s.key] || 0) > 0);
    visible.forEach((s, si) => {
      const v = d.values[s.key];
      const y0 = y(acc), y1 = y(acc + v);
      acc += v;
      const gap = si > 0 ? 2 : 0; // 2px surface gap between stacked segments
      const h = Math.max(y0 - y1 - gap, 0.5);
      const isTop = si === visible.length - 1;
      const path = isTop ? barPath(x, y1, bw, h, 4) : `M${x},${y1}h${bw}v${h}h${-bw}Z`;
      g.append(el('path', { class: 'seg-fill', d: path, fill: s.color }));
    });
    const show = (ev) => tooltip.show(d, totals[i], ev, g);
    g.addEventListener('pointermove', show);
    g.addEventListener('pointerenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('pointerleave', tooltip.hide);
    g.addEventListener('blur', tooltip.hide);
    svg.append(g);
  });

  svg.append(el('line', { x1: m.left, x2: W - m.right, y1: y(0), y2: y(0), stroke: 'var(--rule-strong)', 'stroke-width': 1 }));
  container.append(svg);
}
