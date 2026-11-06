/* ==========================================================================
   Elanlar — /elan (siyahı) və /elan/{id} (elan səhifəsi).
   Girişdən asılı deyil: elan linki sosial şəbəkədə paylaşılır, insan basır,
   qeydiyyatdan keçir, avtomatik elana qayıdır və ideyasını elə oradan göndərir.
   Təsdiqlənməmiş hesab da göndərə bilir — ideya hesab təsdiqlənəndən sonra
   hamıya görünür (server qaydası, CallsApi.cs). Elanı yalnız admin idarə edir.
   ========================================================================== */

/* /elan → 0, /elan/{id} → id, başqa yol → null. */
function callRoute() {
  const m = location.pathname.match(/^\/elan(?:\/(\d+))?\/?$/);
  return m ? (m[1] ? Number(m[1]) : 0) : null;
}

function callUrl(id) { return location.origin + '/elan/' + id; }

const CALL_COLORS = ['#FFEDD5', '#E0F2FE', '#DCFCE7', '#EDE9FE', '#FEF3C7', '#FFE4E6', '#CCFBF1', '#F1F5F9'];
const safeColor = (c) => (/^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : CALL_COLORS[0]);
const isCallAdmin = () => !!(S.me && S.me.role === 'admin' && S.me.status === 'active' && !S.demo);

async function renderCallRoute(id) {
  const token = S.renderToken;
  // Eyni elan yenidən yüklənəndə (əməliyyatdan sonra) köhnə məzmun yerində qalır —
  // «yüklənir» yazısı səhifəni qısaldıb scroll-u yuxarı atmasın.
  const same = id && S.call && S.call.id === id && $('.cwrap');
  if (!same) $('#app').innerHTML = callChrome(`<div class="loading">${t('g_loading')}</div>`);
  try {
    const html = id ? callPageHtml(await API.get('/calls/' + id)) : callsListHtml(await API.get('/calls'));
    if (token !== S.renderToken) return;
    $('#app').innerHTML = callChrome(html);
  } catch (err) {
    if (token !== S.renderToken) return;
    S.call = null;
    $('#app').innerHTML = callChrome(`<div class="empty">${esc(t(err.key === 'e_notFound' ? 'cl_notFound' : (err.key || 'e_network')))}</div>`);
  }
}

function callChrome(inner) {
  const acct = S.me
    ? `<a class="btn btn-ghost btn-sm" href="/#/app">${icon('home', 16)}<span class="chide">${esc(t('cl_cabinet'))}</span></a>`
    : `<a class="btn btn-primary btn-sm" href="/#/login" onclick="rememberNext()">${esc(t('a_login'))}</a>`;
  return `${demoBanner()}<div class="cwrap">
    <header class="ctop">
      <a class="brand" href="/"><span class="m">${logoSvg()}</span>IdeaFlow</a>
      <a class="ctlink" href="/elan">${icon('megaphone', 16)}<span>${esc(t('nav_calls'))}</span></a>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="cycleLang()" aria-label="${esc(t('top_lang'))}">${S.lang.toUpperCase()}</button>
      ${acct}
    </header>
    ${inner}
    <footer class="pubfoot">
      <span>${esc(t('pub_cta'))}</span>
      <a class="btn btn-ghost btn-sm" href="/">IdeaFlow →</a>
    </footer>
  </div>`;
}

/* ------------------------------------------- qeydiyyatdan sonra elana qayıt */
function rememberNext() {
  const r = callRoute();
  if (r === null) return;
  const title = r && S.call && S.call.id === r ? S.call.title : '';
  try { sessionStorage.setItem('if_next', JSON.stringify({ url: location.pathname, title })); } catch (_) { /* gizli rejim */ }
}

/* Yalnız /elan yollarına qayıdırıq — başqa ünvana yönləndirmə (open redirect) olmasın. */
function peekNext() {
  try {
    const n = JSON.parse(sessionStorage.getItem('if_next') || 'null');
    return n && typeof n.url === 'string' && /^\/elan(\/\d+)?\/?$/.test(n.url) ? n : null;
  } catch (_) { return null; }
}

function takeNext() {
  const n = peekNext();
  try { sessionStorage.removeItem('if_next'); } catch (_) { /* gizli rejim */ }
  return n ? n.url : null;
}

function guestToRegister() {
  rememberNext();
  location.href = '/#/register/author';
}

/* ------------------------------------------------------------ köməkçilər */
function callDate(s) {
  const [y, m, d] = String(s || '').split('-').map(Number);
  return y ? fdate(new Date(y, m - 1, d)) : '—';
}

function callBadge(c) {
  return c.accepting
    ? `<span class="badge" style="background:#15803D1f;color:#15803D">● ${esc(t('cl_open'))}</span>`
    : `<span class="badge" style="background:#78716C1f;color:#78716C">${esc(t('cl_closedB'))}</span>`;
}

function deadlineChip(c) {
  return `<span class="chip">${icon('clock', 14)} ${esc(c.deadline ? tf('cl_until', { d: callDate(c.deadline) }) : t('cl_noDeadline'))}</span>`;
}

/* ============================== SİYAHI ============================== */
function callsListHtml(list) {
  S.call = null;
  document.title = t('cl_title') + ' — IdeaFlow';
  return `
  <header class="callhead">
    <div><h1>📣 ${esc(t('cl_title'))}</h1><p>${esc(t('cl_sub'))}</p></div>
    ${isCallAdmin() ? `<button class="btn btn-primary" onclick="editCall(0)">${icon('plus', 18)} ${esc(t('cl_new'))}</button>` : ''}
  </header>
  ${list.length ? `<div class="callgrid">${list.map(callCard).join('')}</div>` : `<div class="empty">${esc(t('cl_empty'))}</div>`}`;
}

/* Üz qabığı: şəkil varsa şəkil (müəllif qeydi ilə), yoxsa rəngli fonda emoji. */
function coverHtml(c, cls, lazy = true) {
  return `<div class="${cls} ${c.coverUrl ? 'hasimg' : ''}" style="background:${safeColor(c.color)}">
    ${c.coverUrl ? `<img src="${esc(c.coverUrl)}" alt="${esc(c.title)}" ${lazy ? 'loading="lazy"' : ''}>` : esc(c.emoji)}
    ${c.coverUrl && c.coverCredit ? `<small class="credit">${esc(c.coverCredit)}</small>` : ''}
  </div>`;
}

function callCard(c) {
  return `<a class="callcard ${c.accepting ? '' : 'closed'}" href="/elan/${c.id}">
    ${coverHtml(c, 'cc-cover')}
    <div class="cc-body">
      <div class="callchips">${callBadge(c)}${deadlineChip(c)}</div>
      <h3>${esc(c.title)}</h3>
      ${c.organizer ? `<p class="cc-org">${esc(c.organizer)}</p>` : ''}
      <p class="cc-ex">${esc(c.excerpt)}</p>
      <div class="cc-foot">
        <span>💡 ${num(c.ideas)} ${esc(t('cl_ideasShort'))}</span>
        ${c.accepting ? `<span class="cc-go">${esc(t('cl_send'))} ${icon('arrow', 16)}</span>` : ''}
      </div>
    </div>
  </a>`;
}

/* =========================== ELAN SƏHİFƏSİ =========================== */
function callPageHtml(c) {
  S.call = c;
  document.title = c.title + ' — IdeaFlow';
  // Admin hamısını (gizlədilmiş və gözləyənlər də) görür, qalanlar — hamıya açıq olanları.
  const gallery = c.entries.filter((e) => c.can.edit || e.visible);
  const mine = c.entries.filter((e) => e.mine);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`${c.title} — ${callUrl(c.id)}`);
  const cta = c.can.block === 'login'
    ? `<button class="btn btn-primary btn-lg callcta" onclick="guestToRegister()">${icon('sparkles', 18)} ${esc(t('cl_cta'))}</button>`
    : c.can.submit
      ? `<button class="btn btn-primary btn-lg callcta" onclick="scrollToForm()">${icon('sparkles', 18)} ${esc(t('cl_cta'))}</button>`
      : '';

  return `
  <a class="back" href="/elan">← ${esc(t('cl_all'))}</a>
  <article class="pubcard callmain">
    ${coverHtml(c, 'pubhero', false)}
    <div class="pubbody">
      <div class="callchips">${callBadge(c)}${deadlineChip(c)}</div>
      <h1>${esc(c.title)}</h1>
      ${c.organizer ? `<p class="muted callorg">${esc(t('cl_org'))}: <b>${esc(c.organizer)}</b></p>` : ''}
      ${cta}
      <div class="pubdescr">${esc(c.descr)}</div>
      <div class="pubstats">
        <div><b>${num(c.ideas)}</b><span>${esc(t('cl_ideas'))}</span></div>
        <div><b>${num(c.people)}</b><span>${esc(t('cl_people'))}</span></div>
      </div>
      <div class="callshare">
        <button class="btn btn-ghost btn-sm" onclick="copyCallLink(${c.id})">${icon('link', 16)} ${esc(t('cl_copy'))}</button>
        <a class="btn btn-ghost btn-sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>
        ${c.can.edit ? `<button class="btn btn-ghost btn-sm" onclick="editCall(${c.id})">✎ ${esc(t('cl_edit'))}</button>` : ''}
      </div>
    </div>
  </article>

  <section class="pubcard" id="callsubmit">${submitBlock(c, mine)}</section>

  <section class="callentries">
    <div class="sechead"><h2>${esc(t('cl_entriesT'))} <span class="muted">${num(gallery.length)}</span></h2></div>
    ${!c.entriesPublic && !c.can.edit
      ? `<div class="empty">🔒 ${esc(t('cl_private'))}</div>`
      : gallery.length
        ? `<div class="entrygrid">${gallery.map((e) => entryCard(e, c)).join('')}</div>`
        : `<div class="empty">${esc(t('cl_noEntries'))}</div>`}
  </section>`;
}

function scrollToForm() {
  const el = document.getElementById('callsubmit');
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => { const f = document.getElementById('ce_title'); if (f) f.focus({ preventScroll: true }); }, 350);
}

function submitBlock(c, mine) {
  const b = c.can.block;
  let body;
  if (b === 'closed') {
    body = `<div class="callnote">🔒 ${esc(t('cl_closed'))}</div>`;
  } else if (b === 'login') {
    body = `<p class="muted callp">${esc(t('cl_guestText'))}</p>
      <div class="callbtns">
        <button class="btn btn-primary" onclick="guestToRegister()">${esc(t('cl_register'))}</button>
        <a class="btn btn-ghost" href="/#/login" onclick="rememberNext()">${esc(t('cl_haveAcc'))}</a>
      </div>`;
  } else if (b === 'account') {
    body = `<div class="callnote">${esc(t('cl_account'))}</div>`;
  } else if (b === 'limit') {
    body = `<div class="callnote">${esc(tf('cl_limit', { n: c.limit }))}</div>`;
  } else {
    body = entryForm(c);
  }
  return `<div class="pubbody">
    <h2>💡 ${esc(t('cl_sendT'))}</h2>
    ${body}
    ${mine.length ? myEntries(mine) : ''}
  </div>`;
}

function entryForm(c) {
  const left = c.limit - c.mine;
  return `
    <div id="formerr"></div>
    <form onsubmit="sendEntry(event, ${c.id})" class="callform">
      <div class="field"><label for="ce_title">${esc(t('cl_fName'))}</label>
        <input id="ce_title" maxlength="120" minlength="3" required placeholder="${esc(t('cl_fNamePh'))}"></div>
      <div class="field"><label for="ce_descr">${esc(t('cl_fDesc'))}</label>
        <textarea id="ce_descr" rows="4" maxlength="3000" placeholder="${esc(t('cl_fDescPh'))}"></textarea></div>
      <fieldset class="specs">
        <legend>📐 ${esc(t('cl_fSize'))}</legend>
        <div class="specgrid">
          ${[['w', 'cl_fW', '9'], ['h', 'cl_fH', '7'], ['d', 'cl_fD', '0,3']].map(([k, label, ph]) => `
            <div class="field"><label for="ce_${k}">${esc(t(label))}</label>
              <input id="ce_${k}" inputmode="decimal" maxlength="9" placeholder="${ph}" pattern="[0-9]+([.,][0-9]{1,2})?"></div>`).join('')}
          <div class="field"><label for="ce_unit">${esc(t('cl_fUnit'))}</label>
            <select id="ce_unit">${['mm', 'cm', 'm'].map((u) => `<option value="${u}" ${u === 'cm' ? 'selected' : ''}>${esc(unitL(u))}</option>`).join('')}</select></div>
        </div>
      </fieldset>
      <div class="field"><label for="ce_mat">🧵 ${esc(t('cl_fMat'))}</label>
        <input id="ce_mat" list="ce_mats" maxlength="300" placeholder="${esc(t('cl_fMatPh'))}">
        <datalist id="ce_mats">${t('cl_matList').split('|').map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
        <div class="muted callsmall">${esc(t('cl_fMatHint'))}</div></div>
      <div class="field"><label for="ce_file">${esc(t('cl_fFile'))}</label>
        <label class="dropzone filepick" for="ce_file" id="ce_drop">
          ${icon('clip', 18)} <span id="ce_fname">${esc(t('cl_fFilePick'))}</span>
        </label>
        <input id="ce_file" type="file" class="vh" onchange="pickedFile(this)"
               accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf">
        <div id="ce_prev"></div>
        <div class="muted callsmall">${esc(t('cl_fFileHint'))}</div>
      </div>
      ${S.me && S.me.status !== 'active' ? `<p class="callhint">⏳ ${esc(t('cl_pendingHint'))}</p>` : ''}
      <button class="btn btn-primary" type="submit" style="width:100%">${esc(t('cl_submit'))}</button>
      <p class="muted callsmall" style="text-align:center;margin-top:8px">${esc(tf('cl_left', { n: left }))}</p>
    </form>`;
}

const MAX_ENTRY_FILE = 10 * 1024 * 1024;

function pickedFile(input) {
  const f = input.files && input.files[0];
  const name = $('#ce_fname'), prev = $('#ce_prev');
  if (prev) prev.innerHTML = '';
  if (!f) { if (name) name.textContent = t('cl_fFilePick'); return; }
  if (f.size > MAX_ENTRY_FILE) {
    toast(t('e_entryBigFile'), false);
    input.value = '';
    if (name) name.textContent = t('cl_fFilePick');
    return;
  }
  if (name) name.textContent = `${f.name} · ${fsize(f.size)}`;
  if (prev && /^image\//.test(f.type)) {
    const url = URL.createObjectURL(f);
    prev.innerHTML = `<img class="ceprev" src="${url}" alt="">`;
  }
}

async function sendEntry(e, id) {
  e.preventDefault();
  formError('');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${esc(t('cl_sending'))}`;
  const fd = new FormData();
  fd.append('title', val('ce_title'));
  fd.append('descr', val('ce_descr'));
  ['w', 'h', 'd'].forEach((k) => fd.append(k, val('ce_' + k)));
  fd.append('unit', val('ce_unit'));
  fd.append('material', val('ce_mat'));
  const f = $('#ce_file') && $('#ce_file').files[0];
  if (f) fd.append('file', f);
  try {
    const res = await API.upload(`/calls/${id}/entries`, fd);
    toast(t(res && res.visible ? 'cl_sentOk' : 'cl_sentPending'));
    await renderCallRoute(id);
    scrollToForm();
  } catch (err) {
    formError(err.key || 'e_network');
    btn.disabled = false;
    btn.textContent = t('cl_submit');
  }
}

function myEntries(list) {
  const st = (e) => e.hidden ? ['cl_stHidden', '#B91C1C'] : e.pending ? ['cl_stPending', '#B45309'] : ['cl_stVisible', '#15803D'];
  return `<div class="mine">
    <h3>${esc(t('cl_mine'))}</h3>
    <ul>${list.map((e) => {
      const [k, col] = st(e);
      return `<li>
        <div><b>${esc(e.title)}</b><small>${fdate(e.createdAt)}</small></div>
        <span class="badge" style="background:${col}1f;color:${col}">${esc(t(k))}</span>
        <button class="btn btn-ghost btn-sm" onclick="deleteEntry(${e.id})" aria-label="${esc(t('cl_delete'))}">✕</button>
      </li>`;
    }).join('')}</ul>
  </div>`;
}

function entryCard(e, c) {
  const media = !e.file
    ? `<div class="emedia none" style="background:${safeColor(c.color)}">💡</div>`
    : e.file.kind === 'image'
      ? `<a class="emedia" href="${e.file.url}" target="_blank" rel="noopener"><img src="${e.file.url}" alt="${esc(e.title)}" loading="lazy"></a>`
      : `<a class="emedia pdf" href="${e.file.url}">📄<span>${esc(t('cl_pdf'))}</span></a>`;
  const flags = [
    e.hidden ? `<span class="badge" style="background:#B91C1C1f;color:#B91C1C">${esc(t('cl_stHidden'))}</span>` : '',
    e.pending ? `<span class="badge" style="background:#B453091f;color:#B45309">${esc(t('cl_stPending'))}</span>` : '',
  ].join('');
  const admin = c.can.edit ? `
    <div class="eadmin">
      ${e.contact ? `<div class="econtact">✉ ${esc(e.contact.email)}${e.contact.phone ? ` · ☎ ${esc(e.contact.phone)}` : ''}</div>` : ''}
      <div class="eacts">
        <button class="btn btn-ghost btn-sm" onclick="hideEntry(${e.id}, ${!e.hidden})">${esc(t(e.hidden ? 'cl_show' : 'cl_hide'))}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEntry(${e.id})">${esc(t('cl_delete'))}</button>
      </div>
    </div>` : '';
  return `<article class="entry ${e.hidden ? 'off' : ''}">
    ${media}
    <div class="ebody">
      ${flags ? `<div class="eflags">${flags}</div>` : ''}
      <h3>${esc(e.title)}</h3>
      ${e.descr ? `<p class="edescr">${esc(e.descr)}</p>` : ''}
      ${specLine(e)}
      <div class="emeta">${icon('user', 14)} ${esc(e.authorName)} · ${fdate(e.createdAt)}</div>
      ${admin}
    </div>
  </article>`;
}

/* Ölçü vahidi və rəqəm dilə uyğun: «sm» / «см» / «cm», «0,3» / «0.3». */
function unitL(u) { return t('cl_unit_' + u); }
function dimL(v) { const s = String(Number(v)); return S.lang === 'en' ? s : s.replace('.', ','); }

/* «📐 9 × 7 × 0,3 sm · 🧵 Tikmə» — en və hündürlük varsa adi yazılış, yoxsa adları ilə. */
function specLine(e) {
  const parts = [];
  const s = e.size;
  if (s) {
    const has = (v) => v !== null && v !== undefined;
    const txt = has(s.w) && has(s.h)
      ? [s.w, s.h, s.d].filter(has).map(dimL).join(' × ')
      : [['cl_fW', s.w], ['cl_fH', s.h], ['cl_fD', s.d]].filter(([, v]) => has(v))
        .map(([k, v]) => `${t(k).toLowerCase()} ${dimL(v)}`).join(', ');
    parts.push(`<span title="${esc(t('cl_fSize'))}">📐 ${esc(txt)} ${esc(unitL(s.unit))}</span>`);
  }
  if (e.material) parts.push(`<span title="${esc(t('cl_fMat'))}">🧵 ${esc(e.material)}</span>`);
  return parts.length ? `<div class="especs">${parts.join('')}</div>` : '';
}

/* ---------------------------------------------------------- əməliyyatlar */
function copyCallLink(id) {
  const url = callUrl(id);
  const done = () => toast(t('cl_copied'));
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, () => prompt('', url));
  else prompt('', url);
}

async function hideEntry(eid, hidden) {
  try {
    await API.post(`/calls/entries/${eid}/hidden`, { hidden });
    render();
  } catch (err) { toastErr(err); }
}

function deleteEntry(eid) {
  confirmBox(t('cl_delEntryQ'), async () => {
    await API.del('/calls/entries/' + eid);
    toast(t('cl_deleted'));
    closeModal();
    render();
  });
}

/* =========================== ADMIN: ELAN FORMASI =========================== */
async function editCall(id) {
  let c = { title: '', organizer: '', descr: '', emoji: '📣', color: CALL_COLORS[0], deadline: null, status: 'open',
    entriesPublic: true, coverUrl: null, coverCredit: '' };
  try {
    if (id) c = S.call && S.call.id === id ? S.call : await API.get('/calls/' + id);
  } catch (err) { toastErr(err); return; }
  openModal(`
    <h3>${esc(t(id ? 'cl_editT' : 'cl_newT'))}</h3>
    <div class="field"><label for="cf_title">${esc(t('cl_fTitle'))}</label>
      <input id="cf_title" maxlength="160" value="${esc(c.title)}"></div>
    <div class="field"><label for="cf_org">${esc(t('cl_fOrg'))}</label>
      <input id="cf_org" maxlength="120" value="${esc(c.organizer)}" placeholder="${esc(t('cl_fOrgPh'))}"></div>
    <div class="grid g2">
      <div class="field"><label for="cf_emoji">${esc(t('cl_fEmoji'))}</label>
        <input id="cf_emoji" maxlength="8" value="${esc(c.emoji)}"></div>
      <div class="field"><label for="cf_deadline">${esc(t('cl_fDeadline'))}</label>
        <input id="cf_deadline" type="date" value="${esc(c.deadline || '')}"></div>
    </div>
    <div class="field"><label>${esc(t('cl_fColor'))}</label>
      <div class="swatches" id="cf_colors">${CALL_COLORS.map((col) => `
        <button type="button" class="${col === safeColor(c.color) ? 'on' : ''}" style="background:${col}" data-c="${col}"
                onclick="pickSwatch(this)" aria-label="${col}"></button>`).join('')}</div></div>
    <div class="field"><label for="cf_cover">${esc(t('cl_fCover'))}</label>
      <div class="coverpick">
        <div class="cp-prev" id="cf_cprev" style="background:${safeColor(c.color)}">
          ${c.coverUrl ? `<img src="${esc(c.coverUrl)}" alt="">` : esc(c.emoji)}</div>
        <div class="cp-acts">
          <label class="btn btn-ghost btn-sm" for="cf_cover">${icon('clip', 16)} ${esc(t('cl_fCoverPick'))}</label>
          <input id="cf_cover" type="file" class="vh" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                 onchange="pickCover(this)">
          ${c.coverUrl ? `<label class="checkrow"><input type="checkbox" id="cf_cdel"> ${esc(t('cl_fCoverDel'))}</label>` : ''}
          <div class="muted callsmall">${esc(t('cl_fCoverHint'))}</div>
        </div>
      </div></div>
    <div class="field"><label for="cf_credit">${esc(t('cl_fCredit'))}</label>
      <input id="cf_credit" maxlength="200" value="${esc(c.coverCredit || '')}" placeholder="${esc(t('cl_fCreditPh'))}"></div>
    <div class="field"><label for="cf_descr">${esc(t('cl_fDescr'))}</label>
      <textarea id="cf_descr" rows="9" maxlength="8000">${esc(c.descr)}</textarea></div>
    <div class="field"><label for="cf_status">${esc(t('cl_fStatus'))}</label>
      <select id="cf_status">
        <option value="open" ${c.status === 'open' ? 'selected' : ''}>${esc(t('cl_open'))}</option>
        <option value="closed" ${c.status === 'closed' ? 'selected' : ''}>${esc(t('cl_closedB'))}</option>
      </select></div>
    <label class="checkrow"><input type="checkbox" id="cf_public" ${c.entriesPublic ? 'checked' : ''}> ${esc(t('cl_fPublic'))}</label>
    <div class="row">
      ${id ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="deleteCall(${id})">${esc(t('cl_delete'))}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">${esc(t('ad_cancel'))}</button>
      <button class="btn btn-primary btn-sm" onclick="submitModal()">${esc(t('ad_save'))}</button>
    </div>`, async () => {
    const on = $('#cf_colors button.on');
    const body = {
      title: val('cf_title'), organizer: val('cf_org'), descr: $('#cf_descr').value.trim(),
      emoji: val('cf_emoji'), color: on ? on.dataset.c : CALL_COLORS[0],
      deadline: val('cf_deadline'), status: val('cf_status'), entriesPublic: $('#cf_public').checked,
      coverCredit: val('cf_credit'),
    };
    const cover = $('#cf_cover').files[0];
    const dropCover = $('#cf_cdel') && $('#cf_cdel').checked;
    let newId = id;
    if (id) await API.patch('/calls/' + id, body);
    else newId = (await API.post('/calls', body)).id;
    // Şəkil ayrıca göndərilir: mətn sahələri JSON-dur, fayl isə multipart.
    if (cover) {
      const fd = new FormData();
      fd.append('file', cover);
      await API.upload(`/calls/${newId}/cover`, fd);
    } else if (dropCover) {
      await API.del(`/calls/${newId}/cover`);
    }
    toast(t('cl_saved'));
    closeModal();
    afterCallChange(newId);
    return true; // modal artıq bağlanıb
  });
}

function pickSwatch(btn) {
  $$('#cf_colors button').forEach((b) => b.classList.toggle('on', b === btn));
  const prev = $('#cf_cprev');
  if (prev) prev.style.background = btn.dataset.c;
}

function pickCover(input) {
  const f = input.files && input.files[0];
  const prev = $('#cf_cprev');
  if (!f || !prev) return;
  if (f.size > MAX_ENTRY_FILE) { toast(t('e_entryBigFile'), false); input.value = ''; return; }
  prev.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
  const del = $('#cf_cdel');
  if (del) del.checked = false;
}

/* Əməliyyatdan sonra harada idiksə ora qayıdırıq: elan səhifəsi, siyahı və ya admin panel. */
function afterCallChange(id) {
  const r = callRoute();
  if (r !== null) {
    if (id && r !== id) location.href = '/elan/' + id;
    else if (!id && r) location.href = '/elan';
    else render();
  } else if (parseHash().parts[0] === 'admin') {
    reloadAdmin();
  } else {
    render();
  }
}

function deleteCall(id) {
  closeModal(); // redaktə pəncərəsi bağlanır, sonra təsdiq soruşulur
  confirmBox(t('cl_delCallQ'), async () => {
    await API.del('/calls/' + id);
    toast(t('cl_deleted'));
    closeModal();
    afterCallChange(0);
  });
}

async function toggleCallStatus(id, status) {
  try {
    await API.patch('/calls/' + id, { status });
    toast(t('cl_saved'));
    afterCallChange(0);
  } catch (err) { toastErr(err); }
}

/* ================= kabinet, landing və admin üçün kiçik bloklar ================= */
function openCallsCard(calls) {
  const open = (calls || []).filter((c) => c.accepting).slice(0, 3);
  if (!open.length) return '';
  return `<div class="card callside">
    <h3>${icon('megaphone', 18)} ${esc(t('cl_dashT'))}</h3>
    <ul class="clist">${open.map((c) => `
      <li><a href="/elan/${c.id}">
        <span class="ce" style="background:${safeColor(c.color)}">${c.coverUrl
          ? `<img src="${esc(c.coverUrl)}" alt="" loading="lazy">` : esc(c.emoji)}</span>
        <span><b>${esc(c.title)}</b><small>💡 ${num(c.ideas)} ${esc(t('cl_ideasShort'))}</small></span>
      </a></li>`).join('')}</ul>
    <a class="callall" href="/elan">${esc(t('cl_all'))} ${icon('arrow', 16)}</a>
  </div>`;
}

/* Landing-də açıq elanlar — səhifə çəkiləndən sonra doldurulur: yuxarıda zolaq
   (ilk ekranda görünsün) və hero-nun altında şəkilli böyük blok. */
async function loadLandingCalls() {
  const el = document.getElementById('lcalls');
  const rib = document.getElementById('lribbon');
  if (!el) return;
  try {
    const open = (await API.get('/calls')).filter((c) => c.accepting);
    if (!open.length || !document.body.contains(el)) return;
    const [main, ...rest] = open;
    if (rib) {
      rib.innerHTML = `<a href="/elan/${main.id}">
        <span class="rb-tag">📣 ${esc(t('cl_ribbon'))}</span>
        <b>${esc(main.title)}</b>
        <span class="rb-go">${esc(t('cl_cta'))} ${icon('arrow', 16)}</span></a>`;
      rib.hidden = false;
    }
    el.innerHTML = `
      <header class="lhd"><span class="lkick">📣 ${esc(t('cl_landKick'))}</span>
        <h2>${esc(t('cl_landT'))}</h2><p>${esc(t('cl_landS'))}</p></header>
      ${featuredCall(main)}
      ${rest.length ? `<div class="callgrid lcmore">${rest.slice(0, 3).map(callCard).join('')}</div>` : ''}`;
    el.hidden = false;
  } catch (_) { /* elanlar landing üçün vacib deyil — səssiz buraxılır */ }
}

function featuredCall(c) {
  const first = String(c.excerpt || '').split(/\n\s*\n/)[0];
  return `<article class="lfeat">
    <a class="lf-media" href="/elan/${c.id}" style="background:${safeColor(c.color)}" aria-label="${esc(c.title)}">
      ${c.coverUrl ? `<img src="${esc(c.coverUrl)}" alt="" loading="lazy">` : `<span class="lf-emoji">${esc(c.emoji)}</span>`}
      <span class="lf-live">● ${esc(t('cl_open'))}</span>
      ${c.coverUrl && c.coverCredit ? `<small class="credit">${esc(c.coverCredit)}</small>` : ''}
    </a>
    <div class="lf-body">
      <div class="callchips">${deadlineChip(c)}${c.organizer ? `<span class="chip">${esc(c.organizer)}</span>` : ''}</div>
      <h3><a href="/elan/${c.id}">${esc(c.title)}</a></h3>
      <p class="lf-ex">${esc(first)}</p>
      <ol class="lf-steps">
        ${['cl_step1', 'cl_step2', 'cl_step3'].map((k, i) => `<li><b>${i + 1}</b><span>${esc(t(k))}</span></li>`).join('')}
      </ol>
      <div class="lf-foot">
        <a class="btn btn-primary btn-lg" href="/elan/${c.id}">${icon('sparkles', 18)} ${esc(t('cl_cta'))}</a>
        <span class="lf-stat"><b>${num(c.ideas)}</b> ${esc(t('cl_ideas'))}</span>
      </div>
    </div>
  </article>`;
}

async function adminCalls() {
  const list = await API.get('/calls');
  return `
  <div class="pillrow" style="justify-content:space-between;align-items:center">
    <p class="muted" style="font-size:13.5px;max-width:620px;margin:0">${esc(t('ad_callsSub'))}</p>
    <button class="btn btn-primary btn-sm" onclick="editCall(0)">${icon('plus', 16)} ${esc(t('cl_new'))}</button>
  </div>
  ${list.length ? `<div class="tablewrap"><table class="tbl">
    <thead><tr>
      <th>${esc(t('cl_fTitle'))}</th><th>${esc(t('cl_fStatus'))}</th><th>${esc(t('cl_fDeadline'))}</th>
      <th>${esc(t('cl_entriesT'))}</th><th></th>
    </tr></thead>
    <tbody>${list.map((c) => `
      <tr>
        <td><b>${esc(c.emoji)} ${esc(c.title)}</b><div class="rowsub">${esc(c.organizer || '—')} · ${fdate(c.createdAt)}</div></td>
        <td>${callBadge(c)}</td>
        <td>${c.deadline ? callDate(c.deadline) : '—'}</td>
        <td>${num(c.ideas)} <span class="muted">/ ${num(c.total)} ${esc(t('cl_total'))}</span></td>
        <td><div class="acts">
          <a class="btn btn-ghost btn-sm" href="/elan/${c.id}">${esc(t('cl_view'))}</a>
          <button class="btn btn-ghost btn-sm" onclick="editCall(${c.id})">${esc(t('cl_edit'))}</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleCallStatus(${c.id}, '${c.status === 'open' ? 'closed' : 'open'}')">
            ${esc(t(c.status === 'open' ? 'cl_toClose' : 'cl_toOpen'))}</button>
        </div></td>
      </tr>`).join('')}</tbody>
  </table></div>` : `<div class="empty">${esc(t('cl_empty'))}</div>`}`;
}
