/* ==========================================================================
   Açıq layihə səhifəsi — /p/{id}. Giriş tələb etmir: müəllif linki paylaşır,
   adi alıcı «Mən alardım» deyir. Server yalnız kataloqda açıq mərhələləri verir.
   ========================================================================== */

function publicProjectId() {
  const m = location.pathname.match(/^\/p\/(\d+)\/?$/);
  return m ? Number(m[1]) : 0;
}

/* Müəllifin paylaşacağı tam link. */
function publicUrl(id) { return location.origin + '/p/' + id; }

async function renderPublic(id) {
  $('#app').innerHTML = `<div class="loading">${t('g_loading')}</div>`;
  let p;
  try {
    p = await API.pub('/projects/' + id);
  } catch (err) {
    $('#app').innerHTML = publicChrome(`<div class="pubcard"><div class="empty">${esc(t('pub_notFound'))}</div></div>`);
    return;
  }
  document.title = p.title + ' — IdeaFlow';
  $('#app').innerHTML = publicChrome(publicHtml(p));
}

function publicChrome(inner) {
  return `<div class="pubwrap">
    <div class="pubtop">
      <a class="brand" href="/"><span class="m">${logoSvg()}</span>IdeaFlow</a>
      <button class="btn btn-ghost btn-sm" onclick="cycleLang()">${S.lang.toUpperCase()}</button>
    </div>
    ${inner}
    <div class="pubfoot">
      <span>${esc(t('pub_cta'))}</span>
      <a class="btn btn-ghost btn-sm" href="/#/register/author">${esc(t('pub_join'))}</a>
    </div>
  </div>`;
}

function publicHtml(p) {
  const [bg, em] = COVERS[p.category] || ['#EEE', '📦'];
  const done = hasSentInterest(p.id);
  return `
  <div class="pubcard">
    <div class="pubhero" style="background:${bg}">${em}</div>
    <div class="pubbody">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${badge(p.status)}<span class="muted" style="font-size:13px">${esc(catL(p.category))}</span>
      </div>
      <h1>${esc(p.title)}</h1>
      <p class="muted" style="font-size:14px">${esc(t('pub_by'))}: ${esc(p.authorName)}</p>
      ${p.price ? `<div class="pubprice"><span class="muted">${esc(t('pub_price'))}</span><b>${money(p.price)}</b></div>` : ''}
      <p class="pubdescr">${esc(p.descr || '')}</p>
      <div class="pubstats" id="pubstats">${publicStats(p)}</div>
    </div>
  </div>
  <div class="pubcard" id="pubform">
    ${done ? publicThanks() : `
    <div class="pubbody">
      <h2>🙋 ${esc(t('pub_want'))}</h2>
      <p class="muted" style="font-size:14px;margin:4px 0 14px">${esc(t('pub_wantSub'))}</p>
      <div id="formerr"></div>
      <form onsubmit="sendInterest(event, ${p.id})">
        <div class="field"><label>${esc(t('pub_name'))}</label>
          <input id="pi_name" autocomplete="name" maxlength="80" required></div>
        <div class="field"><label>${esc(t('pub_contact'))}</label>
          <input id="pi_contact" autocomplete="tel" inputmode="email" maxlength="120" required
                 placeholder="+994 50 000 00 00"></div>
        <div class="field"><label>${esc(t('pub_qty'))}</label>
          <input id="pi_qty" type="number" min="1" max="100" value="1"></div>
        <div class="field"><label>${esc(t('pub_note'))}</label>
          <input id="pi_note" maxlength="500"></div>
        <!-- Botlar üçün tələ: insan bu sahəni görmür. -->
        <div class="hp" aria-hidden="true"><input id="pi_website" tabindex="-1" autocomplete="off"></div>
        <button class="btn btn-primary" type="submit" style="width:100%">${esc(t('pub_send'))}</button>
        <p class="muted" style="font-size:12px;margin-top:10px;text-align:center">🔒 ${esc(t('pub_privacy'))}</p>
      </form>
    </div>`}
  </div>`;
}

function publicStats(p) {
  return `
    <div><b>${num(p.people)}</b><span>${esc(t('pub_people'))}</span></div>
    <div><b>${num(p.interest + p.preorders)}</b><span>${esc(t('pub_units'))}</span></div>`;
}

function publicThanks() {
  return `<div class="pubbody" style="text-align:center;padding:28px 20px">
    <div style="font-size:40px">🎉</div>
    <h2 style="margin-top:6px">${esc(t('pub_thanks'))}</h2>
    <p class="muted" style="font-size:13px;margin-top:6px">🔒 ${esc(t('pub_privacy'))}</p>
  </div>`;
}

/* Göndərəndən sonra formanı eyni brauzerdə təkrar göstərmirik. */
function hasSentInterest(id) {
  try { return localStorage.getItem('if_interest_' + id) === '1'; } catch (_) { return false; }
}

async function sendInterest(e, id) {
  e.preventDefault();
  formError('');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const res = await API.post(`/public/projects/${id}/interest`, {
      name: val('pi_name'), contact: val('pi_contact'), qty: numVal('pi_qty') || 1,
      note: val('pi_note'), website: val('pi_website'),
    });
    try { localStorage.setItem('if_interest_' + id, '1'); } catch (_) { /* gizli rejim */ }
    $('#pubform').innerHTML = publicThanks();
    const p = await API.pub('/projects/' + id).catch(() => null);
    if (p) $('#pubstats').innerHTML = publicStats(p);
    else if (res && res.people !== undefined) toast(t('pub_thanks'));
  } catch (err) {
    formError(err.key || 'e_network');
    btn.disabled = false;
  }
}
