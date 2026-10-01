/* ==========================================================================
   UI köməkçiləri: qaçırma, toast, nişanlar, formatlar, qrafiklər, modal.
   ========================================================================== */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------------ ikonlar
   Lucide üslubunda xətti SVG ikonlar (emoji hər platformada fərqli görünür). */
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  factory: '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1M12 18h1M7 18h1"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 17v4M17 19h4"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  store: '<path d="M3 9h18l-1.5-5h-15Z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z"/>',
};

function icon(name, size = 20) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* Avatar üçün baş hərflər: «Aysel Məmmədova» → «AM». */
function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/* Dairəvi irəliləyiş halqası (0–100). */
function ring(pct, size = 54, color = 'var(--accent)') {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="6"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="${size * 0.26}" font-weight="900" fill="currentColor">${Math.round(pct)}%</text>
  </svg>`;
}

/* Layihənin mərhələ üzrə irəliləyişi (draft=0 … sales=100). */
function stageProgress(status) {
  const order = ['draft', 'assess', 'demand', 'findmaker', 'findinv', 'deal', 'prod', 'sales'];
  const i = order.indexOf(status);
  return i < 0 ? 0 : Math.round(i / (order.length - 1) * 100);
}

function toast(msg, ok = true) {
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* Serverdən gələn xətanı istifadəçi dilində göstərir. */
function toastErr(err) {
  toast(t(err && err.key ? err.key : 'e_network'), false);
}

const STATUS_COLOR = {
  draft: '#78716C', assess: '#B45309', demand: '#0F766E', findmaker: '#C2410C',
  findinv: '#1D4ED8', deal: '#6D28D9', prod: '#7E22CE', sales: '#15803D', rejected: '#B91C1C',
};
const ROLE_META = {
  author:   { color: 'var(--author)',   emoji: '💡' },
  maker:    { color: 'var(--maker)',    emoji: '🏭' },
  investor: { color: 'var(--investor)', emoji: '📈' },
  seller:   { color: 'var(--seller)',   emoji: '🛒' },
  admin:    { color: 'var(--admin)',    emoji: '🛡' },
};
const CATS = ['electronics', 'home', 'sport', 'gadgets', 'eco', 'apparel'];
const COVERS = {
  electronics: ['#E0F2FE', '🔌'], home: ['#FEF3C7', '🏠'], sport: ['#DCFCE7', '🏅'],
  gadgets: ['#EDE9FE', '📱'], eco: ['#ECFCCB', '🌱'], apparel: ['#FFE4E6', '👕'],
};

/* Royalti admin tərəfindən təyin olunur; 0 — hələ təyin edilməyib. */
function royaltyL(p) { return p.royalty > 0 ? p.royalty + '%' : t('roy_pending'); }
const DOCTYPES = { nda: '#42607A', patent: '#7A5AA6', contract: '#1F5E8C', cert: '#0E7C66', other: '#7A8794' };
const USER_STATUS_COLOR = { pending: '#B45309', active: '#15803D', blocked: '#B91C1C', rejected: '#78716C' };

function badge(st) {
  const c = STATUS_COLOR[st] || '#888';
  return `<span class="badge" style="background:${c}1f;color:${c}">${esc(sl(st))}</span>`;
}

function userBadge(st) {
  const c = USER_STATUS_COLOR[st] || '#888';
  return `<span class="badge" style="background:${c}1f;color:${c}">${esc(t('ad_st_' + st))}</span>`;
}

function stars(r) {
  if (!r) return `<span class="muted">${t('c_notRated')}</span>`;
  const f = Math.round(r / 20);
  return `<span class="rating"><span class="s">${'★'.repeat(f)}${'☆'.repeat(5 - f)}</span> ${r}</span>`;
}

function trustBar(v) {
  return `<span class="trustbar"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></span> <b>${v}</b>`;
}

/* Məbləğlər bazada numeric saxlanılır — göstərişdə $ və boşluqlu qruplaşma. */
function money(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/,/g, ' ');
}

function num(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

/* Brauzerlərin çoxunda az-AZ üçün ay adları yoxdur («2026 M09 20» çıxır),
   ona görə Azərbaycan dilində tarixi özümüz qururuq. */
const AZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const pad2 = (n) => String(n).padStart(2, '0');

function fdate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  if (S.lang !== 'en' && S.lang !== 'ru') return `${pad2(d.getDate())} ${AZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'ru-RU',
    { day: '2-digit', month: 'short', year: 'numeric' });
}

function fdatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  if (S.lang !== 'en' && S.lang !== 'ru') {
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return d.toLocaleString(S.lang === 'en' ? 'en-GB' : 'ru-RU',
    { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fsize(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

/* --------------------------------------------------------------- qrafiklər */
function chartRow(label, val, max, color) {
  const w = max > 0 ? Math.max(6, Math.round(val / max * 100)) : 6;
  return `<div class="chartrow"><div class="cl">${esc(label)}</div>
    <div class="ct"><div class="cf" style="width:${w}%;background:${color}">${num(val)}</div></div></div>`;
}

function lineChart(labels, data) {
  if (!labels.length) return `<div class="empty">${t('c_empty')}</div>`;
  const W = 640, H = 210, pl = 34, pr = 14, pt = 16, pb = 28;
  const max = Math.max(...data, 1) * 1.15, iw = W - pl - pr, ih = H - pt - pb;
  const x = (i) => labels.length === 1 ? pl + iw / 2 : pl + (iw * i / (labels.length - 1));
  const y = (v) => pt + ih - (v / max * ih);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `M${x(0).toFixed(1)} ${(pt + ih).toFixed(1)} ` +
    pts.map((p) => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') +
    ` L${x(labels.length - 1).toFixed(1)} ${(pt + ih).toFixed(1)} Z`;
  const grid = [0, .5, 1].map((f) => {
    const yy = (pt + ih - f * ih).toFixed(1);
    return `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>
            <text x="6" y="${(+yy + 4)}" font-size="10" fill="var(--muted)">${Math.round(max * f)}</text>`;
  }).join('');
  const dots = pts.map((p, i) =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
     <text x="${p[0].toFixed(1)}" y="${(p[1] - 10).toFixed(1)}" font-size="10.5" font-weight="700" fill="var(--ink)" text-anchor="middle">${data[i]}</text>`).join('');
  const xl = labels.map((l, i) =>
    `<text x="${x(i).toFixed(1)}" y="${H - 8}" font-size="10.5" fill="var(--muted)" text-anchor="middle">${esc(l)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;margin-top:8px">${grid}
    <path d="${area}" fill="var(--accent)" opacity=".10"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xl}</svg>`;
}

/* Layihənin mərhələ zolağı. */
const FLOW = ['assess', 'demand', 'findmaker', 'findinv', 'deal', 'prod', 'sales'];
function timeline(status) {
  if (status === 'rejected') {
    return `<div class="empty" style="color:var(--admin);padding:14px">${t('st_rejected')}</div>`;
  }
  const cur = FLOW.indexOf(status);
  return `<div class="timeline">${FLOW.map((s, i) =>
    `<div class="tl ${i < cur ? 'done' : ''} ${i === cur ? 'cur' : ''}">
       <span class="d"></span><span>${esc(t('tl_' + s))}</span></div>`).join('')}</div>`;
}

/* ------------------------------------------------------------------ modal */
let modalHandler = null;

function openModal(html, onSubmit) {
  modalHandler = onSubmit || null;
  const el = document.createElement('div');
  el.className = 'modal';
  el.id = 'modal';
  el.innerHTML = `<div class="modalcard">${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeModal(); });
  document.body.appendChild(el);
  const first = el.querySelector('input, select, textarea');
  if (first) first.focus();
}

function closeModal() {
  const el = $('#modal');
  if (el) el.remove();
  modalHandler = null;
}

async function submitModal() {
  if (!modalHandler) return;
  const fn = modalHandler;
  try {
    const keep = await fn();
    if (!keep) closeModal();
  } catch (err) {
    toastErr(err);
  }
}

function confirmBox(text, onYes) {
  openModal(`
    <h3>${esc(text)}</h3>
    <div class="row">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">${t('ad_cancel')}</button>
      <button class="btn btn-danger btn-sm" onclick="submitModal()">${t('g_yes')}</button>
    </div>`, onYes);
}

/* Formadan dəyər oxumaq üçün qısa yol. */
function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function numVal(id) { const v = val(id); return v === '' ? null : Number(v); }
