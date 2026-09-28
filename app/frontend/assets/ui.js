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
  draft: '#8A8A8A', assess: '#C9A227', demand: '#0E7C66', findmaker: '#C07A2C',
  findinv: '#2E86C1', deal: '#1F5E8C', prod: '#7A5AA6', sales: '#0E7C66', rejected: '#C0392B',
};
const ROLE_META = {
  author:   { color: 'var(--author)',   emoji: '💡' },
  maker:    { color: 'var(--maker)',    emoji: '🏭' },
  investor: { color: 'var(--investor)', emoji: '📈' },
  seller:   { color: 'var(--seller)',   emoji: '🛒' },
  admin:    { color: 'var(--admin)',    emoji: '🛡' },
};
const CATS = ['electronics', 'home', 'sport', 'gadgets', 'eco'];
const COVERS = {
  electronics: ['#EAF1F6', '🔌'], home: ['#F1EEE9', '🏠'], sport: ['#EAF6F2', '🏅'],
  gadgets: ['#F0ECF6', '📱'], eco: ['#EDF6EC', '🌱'],
};
const DOCTYPES = { nda: '#42607A', patent: '#7A5AA6', contract: '#1F5E8C', cert: '#0E7C66', other: '#7A8794' };
const USER_STATUS_COLOR = { pending: '#C9A227', active: '#0E7C66', blocked: '#C0392B', rejected: '#7A8794' };

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

function fdate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(S.lang === 'en' ? 'en-GB' : S.lang === 'ru' ? 'ru-RU' : 'az-AZ',
    { day: '2-digit', month: 'short', year: 'numeric' });
}

function fdatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString(S.lang === 'en' ? 'en-GB' : S.lang === 'ru' ? 'ru-RU' : 'az-AZ',
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
