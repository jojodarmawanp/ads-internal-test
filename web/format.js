// Shared number and date formatting (Indonesian conventions).
const compactFmt = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
export const whole = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const compact = (n) => compactFmt.format(n).replace(' ', ' ');
export const rp = (n) => (Number.isFinite(n) ? `Rp ${compact(n)}` : '–');
export const rpFull = (n) => (Number.isFinite(n) ? `Rp ${whole.format(Math.round(n))}` : '–');
export const ratio = (n) => (Number.isFinite(n) ? oneFmt.format(n) : '–');
export const count = (n) => (Number.isFinite(n) ? whole.format(Math.round(n)) : '–');
export const dateLabel = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

// Parse "5.000.000", "5jt", "5 juta", "500rb", "1,5jt" into a number of rupiah.
export function parseRupiah(input) {
  const s = String(input ?? '').toLowerCase().replace(/rp|\s/g, '');
  const m = s.match(/^([\d.,]+)(jt|juta|rb|ribu|k|m)?$/);
  if (!m) return NaN;
  const unit = { jt: 1e6, juta: 1e6, m: 1e6, rb: 1e3, ribu: 1e3, k: 1e3 }[m[2]] ?? 1;
  const num = m[2] ? Number(m[1].replace(/\./g, '').replace(',', '.')) : Number(m[1].replace(/[.,]/g, ''));
  return num * unit;
}

export function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}
