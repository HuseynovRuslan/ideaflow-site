/* ==========================================================================
   IdeaFlow — vəziyyət, marşrutlama, ümumi ekranlar.
   Bütün məlumat serverdən gəlir; burada yalnız görüntü və naviqasiya var.
   ========================================================================== */

const S = {
  lang: localStorage.getItem('if_lang') || 'az',
  theme: localStorage.getItem('if_theme') || 'light',
  me: null,
  notifs: [],
  showN: false,
  filterCat: 'all',
  search: '',
  tab: 'about',
  project: null,
  renderToken: 0,
  demo: null,    // admin rol baxışı: 'author' | 'maker' | 'investor' | 'seller'
  realMe: null,  // demo zamanı adminin özü
};

/* --------------------------------------------------------------- marşrut */
function go(h) { location.hash = h; }

function parseHash() {
  const h = (location.hash || '#/').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  return { path: '/' + parts.join('/'), parts };
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  applyTheme();
  try {
    S.me = await API.me();
    if (S.me.lang && S.me.lang !== S.lang) setLang(S.me.lang, false);
    resumeDemo();
  } catch (_) {
    S.me = null; // giriş edilməyib — normal haldır
  }
  render();
}

async function render() {
  const token = ++S.renderToken;
  document.documentElement.lang = S.lang;
  document.title = t('appTitle');
  const { parts } = parseHash();
  const first = parts[0] || '';

  // --- açıq layihə səhifəsi (/p/{id}) — girişdən asılı deyil ---
  const pubId = publicProjectId();
  if (pubId) return void (await renderPublic(pubId));

  // --- giriş etməyənlər ---
  if (!S.me) {
    if (first === 'login') return void ($('#app').innerHTML = loginView());
    if (first === 'register') return void ($('#app').innerHTML = registerView(parts[1]));
    return void ($('#app').innerHTML = landingView());
  }

  // --- hesab hələ aktiv deyil ---
  if (S.me.status !== 'active') return void ($('#app').innerHTML = waitView());

  // --- admin paneli ayrıca modul ---
  if (first === 'admin') return void (await renderAdmin(parts.slice(1), token));

  if (first === 'project' && parts[1]) return void (await renderProject(parts[1] === 'ex' ? 'ex' : Number(parts[1]), token));
  if (first === 'contract' && parts[1]) return void (await renderContract(Number(parts[1]), token));

  const views = {
    '': dashboardView, app: dashboardView, projects: projectsView, new: newProjectView,
    makers: () => directoryView('maker'), investors: () => directoryView('investor'),
    sellers: () => directoryView('seller'), pricing: pricingView, analytics: analyticsView,
    profile: profileView,
  };
  const view = views[first] || dashboardView;

  shell(`<div class="loading">${t('g_loading')}</div>`);
  try {
    const html = await view();
    if (token === S.renderToken) setContent(html);
  } catch (err) {
    if (token !== S.renderToken) return;
    if (err.key === 'e_auth') { S.me = null; return render(); }
    setContent(`<div class="empty">${esc(t(err.key || 'e_network'))}</div>`);
  }
  refreshNotifs();
}

/* ------------------------------------------------------------- görüntü */
function setContent(html) {
  const el = document.getElementById('content');
  if (el) el.innerHTML = html;
}

/* Rol üzrə menyu elementləri: [href, i18n açarı, ikon]. */
function navList() {
  const r = S.me.role;
  const items = [['#/app', 'nav_overview', 'home'], ['#/projects', 'nav_projects', 'grid']];
  if (r === 'author') items.push(['#/new', 'nav_new', 'plus']);
  if (r === 'investor' || r === 'admin') items.push(['#/investors', 'nav_investors', 'trending']);
  if (r === 'maker' || r === 'admin' || r === 'author') items.push(['#/makers', 'nav_makers', 'factory']);
  items.push(['#/analytics', 'nav_analytics', 'chart']);
  items.push(['#/pricing', 'nav_pricing', 'tag']);
  if (r === 'admin') items.push(['#/admin', 'nav_admin', 'shield']);
  return items;
}

function isOn(href) {
  const h = location.hash || '#/app';
  return h === href || h.startsWith(href + '/') || (href === '#/app' && (h === '#/' || h === ''));
}

function navItems() {
  return navList().map(([href, k, i]) =>
    `<a href="${href}" class="${isOn(href) ? 'on' : ''}"><span class="i">${icon(i)}</span>${esc(t(k))}</a>`).join('');
}

/* Mobil alt panel: ən çox lazım olan 4 bölmə + «Menyu». */
function tabbar() {
  const items = navList().filter(([href]) => ['#/app', '#/projects', '#/new', '#/admin', '#/makers', '#/investors'].includes(href)).slice(0, 4);
  return `<nav class="tabbar" aria-label="${esc(t('nav_menu'))}">
    ${items.map(([href, k, i]) => `<a href="${href}" class="${isOn(href) ? 'on' : ''} ${href === '#/new' ? 'fab' : ''}">
      ${icon(i, 22)}<span>${esc(t(k))}</span></a>`).join('')}
    <button onclick="toggleMenu()">${icon('menu', 22)}<span>${esc(t('nav_menu'))}</span></button>
  </nav>`;
}

function shell(inner) {
  const meta = ROLE_META[S.me.role] || ROLE_META.author;
  const nCount = S.notifs.length;
  document.body.classList.remove('menu-open'); // hər keçiddə mobil menyu bağlanır
  $('#app').innerHTML = `${demoBanner()}
  <div class="app">
    <aside class="nav" onclick="if(event.target.closest('a'))toggleMenu(false)">
      <a class="brand" href="#/app"><span class="m">${logoSvg()}</span>IdeaFlow</a>
      <a class="me" href="#/profile">
        <span class="av" style="--c:${meta.color}">${esc(initials(S.me.fullName))}</span>
        <span class="mi"><b>${esc(S.me.fullName)}</b><small>${meta.emoji} ${esc(rl(S.me.role))}</small></span>
      </a>
      <div class="grp">${esc(t('nav_menu'))}</div>
      <nav class="navlist">${navItems()}</nav>
      ${S.me.role === 'author' ? `
        <a class="navcta" href="#/new">
          <span class="ci">${icon('sparkles', 22)}</span>
          <b>${esc(t('cta_newTitle'))}</b><small>${esc(t('cta_newSub'))}</small>
        </a>` : ''}
      <div class="navfoot">
        <a href="#/profile" class="${isOn('#/profile') ? 'on' : ''}"><span class="i">${icon('user')}</span>${esc(t('pf_title'))}</a>
        <a onclick="doLogout()"><span class="i">${icon('logout')}</span>${esc(t('a_logout'))}</a>
      </div>
    </aside>
    <div class="main">
      <header class="bar">
        <button class="ticon burger" onclick="toggleMenu()" aria-label="${esc(t('nav_menu'))}">${icon('menu')}</button>
        <a class="brand mbrand" href="#/app"><span class="m">${logoSvg()}</span>IdeaFlow</a>
        <div class="spacer"></div>
        <button class="ticon" onclick="cycleLang()" title="${esc(t('top_lang'))}" aria-label="${esc(t('top_lang'))}">
          <span class="lng">${S.lang.toUpperCase()}</span></button>
        <button class="ticon" onclick="toggleTheme()" title="${esc(t('top_theme'))}" aria-label="${esc(t('top_theme'))}">
          ${icon(S.theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="bell ticon" onclick="toggleNotifs()" aria-label="${esc(t('top_notifs'))}">${icon('bell')}${nCount ? `<span class="cnt">${nCount > 99 ? '99+' : nCount}</span>` : ''}</button>
        ${S.showN ? notifDropdown() : ''}
      </header>
      <main class="content" id="content">${inner}</main>
    </div>
  </div>
  ${tabbar()}
  <div class="mscrim" onclick="toggleMenu(false)"></div>`;
}

/* Mobil menyu (≤820px): sol panel siyirmə kimi açılır. */
function toggleMenu(force) {
  const open = force === undefined ? !document.body.classList.contains('menu-open') : force;
  document.body.classList.toggle('menu-open', open);
}

function logoSvg() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c.6.6 1 1.2 1 2h6c0-.8.4-1.4 1-2a6 6 0 0 0-4-10Z"/></svg>`;
}

/* ------------------------------------------------------- dil / görünüş */
function setLang(lang, save = true) {
  S.lang = lang;
  localStorage.setItem('if_lang', lang);
  if (save && S.me) API.post('/me/lang', { lang }).catch(() => {});
}

function cycleLang() {
  setLang(LANGS[(LANGS.indexOf(S.lang) + 1) % LANGS.length]);
  render();
}

function applyTheme() {
  document.documentElement.dataset.theme = S.theme === 'dark' ? 'dark' : '';
}

function toggleTheme() {
  S.theme = S.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('if_theme', S.theme);
  applyTheme();
  S.showN = false;
  render();
}

/* --------------------------------------------------------- bildirişlər */
async function refreshNotifs() {
  if (!S.me || S.me.status !== 'active') return;
  try {
    const list = await API.get('/notifications');
    const changed = list.length !== S.notifs.length;
    S.notifs = list;
    if (changed) {
      const bell = document.querySelector('.bell');
      if (bell) {
        bell.innerHTML = `${icon('bell')}${list.length ? `<span class="cnt">${list.length > 99 ? '99+' : list.length}</span>` : ''}`;
      }
    }
  } catch (_) { /* bildirişlər kritik deyil — səssiz buraxılır */ }
}

function notifDropdown() {
  if (!S.notifs.length) {
    return `<div class="ndrop"><div class="nh">${t('top_notifs')}</div>
      <div class="ni muted">${t('n_empty')}</div></div>`;
  }
  return `<div class="ndrop"><div class="nh">${t('top_notifs')}</div>
    ${S.notifs.map((n) => `
      <div class="ni" ${n.projectId ? `onclick="S.showN=false;go('#/project/${n.projectId}')" style="cursor:pointer"` : ''}>
        ${esc(t(n.key))}
        <div class="tm">${esc(n.title)} · ${fdatetime(n.at)}</div>
      </div>`).join('')}</div>`;
}

function toggleNotifs() { S.showN = !S.showN; render(); }

/* ================================ LANDING ================================ */
/* Qonağın ilk ekranı. Məqsəd: bir neçə saniyədə «bu nədir, kimə lazımdır,
   mən nə qazanıram» aydın olsun. Hero-dakı «ideyanın yolu» kartı bütün modeli
   bir baxışda göstərir: kim nə edir və pul müəllifə necə qayıdır. */
function lpScroll(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function landingView() {
  // [ikon, rəng, i18n açarı] — ardıcıllıq real mərhələ sırasıdır.
  const route = [
    ['bulb', 'var(--author)', 'lp_r1'],
    ['sparkles', 'var(--accent)', 'lp_r2'],
    ['factory', 'var(--maker)', 'lp_r3'],
    ['trending', 'var(--investor)', 'lp_r4'],
    ['store', 'var(--seller)', 'lp_r5'],
  ];
  const roles = [
    ['author', 'bulb', rl('author'), 'a'],
    ['maker', 'factory', t('j_maker'), 'm'],
    ['investor', 'trending', rl('investor'), 'i'],
    ['seller', 'store', rl('seller'), 's'],
  ];
  const cascade = ['var(--platform)', 'var(--author)', 'var(--investor)', 'var(--seller)'];
  const ex = Demo.example();
  const anchor = (id, k, cls = '') =>
    `<a ${cls ? `class="${cls}"` : ''} href="#${id}" onclick="event.preventDefault();lpScroll('${id}')">${esc(t(k))}</a>`;

  return `
  <div class="land">
    <header class="lnav">
      <a class="brand" href="#/"><span class="m">${logoSvg()}</span>IdeaFlow</a>
      <nav class="llinks" aria-label="${esc(t('nav_menu'))}">
        ${anchor('how', 'ln_how')}${anchor('roles', 'ln_roles')}${anchor('faq', 'ln_faq')}
      </nav>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="cycleLang()" aria-label="${esc(t('top_lang'))}">${S.lang.toUpperCase()}</button>
      <a class="btn btn-ghost btn-sm" href="#/login">${esc(t('a_login'))}</a>
      <a class="btn btn-primary btn-sm lhide" href="#/register">${esc(t('a_register'))}</a>
    </header>

    <section class="lhero">
      <div class="lcopy">
        <h1>${esc(t('lp_h1'))}</h1>
        <p class="lsub">${esc(t('lp_sub'))}</p>
        <div class="lcta">
          <a class="btn btn-primary btn-lg" href="#/register">${esc(t('a_register'))}</a>
          ${anchor('how', 'ln_how', 'btn btn-ghost btn-lg')}
        </div>
        <ul class="lfacts">
          ${['lp_f1', 'lp_f2', 'lp_f3'].map((k) => `<li>${icon('check', 16)}<span>${esc(t(k))}</span></li>`).join('')}
        </ul>
      </div>

      <figure class="lroute">
        <figcaption>${esc(t('lp_route'))}</figcaption>
        <ol>
          ${route.map(([ic, c, k], i) => `
            <li style="--c:${c};--i:${i}"><span class="rdot">${icon(ic, 18)}</span>
              <p><b>${esc(t(k + 't'))}</b> ${esc(t(k))}</p></li>`).join('')}
          <li class="rback" style="--i:5"><span class="rdot">${icon('coins', 18)}</span>
            <p><b>${esc(t('lp_r6t'))}</b> ${esc(t('lp_r6'))}</p></li>
        </ol>
      </figure>
    </section>

    <section class="lsec" id="how">
      <header class="lhd"><h2>${esc(t('lp_howT'))}</h2><p>${esc(t('lp_howS'))}</p></header>
      <ol class="ltl">
        ${[1, 2, 3, 4, 5].map((n) => `
          <li><span class="tn">${n}</span>
            <div><h3>${esc(t(`lp_s${n}t`))}</h3><p>${esc(t(`lp_s${n}`))}</p></div></li>`).join('')}
      </ol>
      <div class="lex">
        <p class="lexl">${esc(t('lp_exT'))}</p>
        ${journey(ex, true)}
      </div>
    </section>

    <section class="lsec" id="roles">
      <header class="lhd"><h2>${esc(t('lp_rolesT'))}</h2><p>${esc(t('lp_rolesS'))}</p></header>
      <div class="lroles">
        ${roles.map(([r, ic, name, p]) => `
          <article class="lrole" style="--c:${ROLE_META[r].color}">
            <h3><span class="ri">${icon(ic, 22)}</span>${esc(name)}</h3>
            <dl>
              <dt>${esc(t('lp_do'))}</dt><dd>${esc(t(`lp_${p}Do`))}</dd>
              <dt>${esc(t('lp_get'))}</dt><dd>${esc(t(`lp_${p}Get`))}</dd>
            </dl>
            <a class="go" href="#/register/${r}">${esc(t('a_register'))}</a>
          </article>`).join('')}
      </div>
    </section>

    <section class="lsec lmoney">
      <header class="lhd">
        <h2>${esc(t('lp_moneyT'))}</h2><p>${esc(t('lp_moneyS'))}</p>
        <p class="lnote">${esc(t('lp_moneyNote'))}</p>
      </header>
      <ol class="lcascade">
        ${cascade.map((c, i) => `
          <li style="--c:${c};--n:${i}" class="${i === 1 ? 'me' : ''}">
            <span class="cn">${i + 1}</span><b>${esc(t(`lp_w${i + 1}t`))}</b><small>${esc(t(`lp_w${i + 1}`))}</small></li>`).join('')}
      </ol>
    </section>

    <section class="lsec lfaq" id="faq">
      <header class="lhd"><h2>${esc(t('lp_faqT'))}</h2></header>
      <div class="lqa">
        ${[1, 2, 3, 4, 5].map((n) => `
          <details><summary>${esc(t(`lp_q${n}`))}</summary><p>${esc(t(`lp_a${n}`))}</p></details>`).join('')}
      </div>
    </section>

    <section class="lfinal">
      <h2>${esc(t('lp_finT'))}</h2>
      <p>${esc(t('lp_finS'))}</p>
      <div class="lfbtns">
        <a class="btn btn-lg lfbtn" href="#/register">${esc(t('a_register'))}</a>
        ${anchor('roles', 'lp_finRole', 'btn btn-lg lfbtn2')}
      </div>
    </section>
    <footer class="lfoot"><span>© ${new Date().getFullYear()} IdeaFlow</span>
      <span>${esc(t('a_hasAcc'))} <a href="#/login">${esc(t('a_login'))}</a></span></footer>
  </div>`;
}

/* =========================== GİRİŞ / QEYDİYYAT =========================== */
/* İki hissəli ekran: solda brend paneli (dəyər təklifi), sağda forma. */
function authChrome(inner) {
  return `<div class="authsplit">
    <aside class="authbrand">
      <a class="brand" href="#/"><span class="m">${logoSvg()}</span>IdeaFlow</a>
      <div class="abcopy">
        <h2>${esc(t('l_h1a'))} <span class="g">${esc(t('l_h1b'))}</span></h2>
        <ul>${['lt_1', 'lt_2', 'lt_3'].map((k) => `<li>${icon('check', 18)} ${esc(t(k))}</li>`).join('')}</ul>
      </div>
      <div class="abflow" aria-hidden="true">
        <span>${icon('bulb', 18)}</span><i></i><span>${icon('factory', 18)}</span><i></i><span>${icon('box', 18)}</span><i></i><span>${icon('store', 18)}</span>
      </div>
    </aside>
    <div class="authside">
      <div class="authtop">
        <a class="btn btn-ghost btn-sm" href="#/">← IdeaFlow</a>
        <button class="btn btn-ghost btn-sm" onclick="cycleLang()" aria-label="${esc(t('top_lang'))}">${S.lang.toUpperCase()}</button>
      </div>
      <div class="authcard">${inner}</div>
    </div>
  </div>`;
}

function loginView() {
  return authChrome(`
    <h2>${esc(t('a_loginTitle'))}</h2>
    <div class="sub">${esc(t('a_loginSub'))}</div>
    <div id="formerr"></div>
    <form onsubmit="doLogin(event)">
      <div class="field"><label>${esc(t('a_email'))}</label>
        <input id="lg_email" type="email" autocomplete="username" required></div>
      <div class="field"><label>${esc(t('a_pass'))}</label>
        <input id="lg_pass" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">${esc(t('a_login'))}</button>
    </form>
    <div class="authswap">${esc(t('a_noAcc'))} <a href="#/register">${esc(t('a_register'))}</a></div>
    <div class="authswap"><a href="#/">${esc(t('a_backHome'))}</a></div>`);
}

let regRole = 'author';

function registerView(preset) {
  if (preset && Rules_roles.includes(preset)) regRole = preset;
  return authChrome(`
    <h2>${esc(t('a_regTitle'))}</h2>
    <div class="sub">${esc(t('a_regSub'))}</div>
    <div id="formerr"></div>
    <form onsubmit="doRegister(event)">
      <div class="field"><label>${esc(t('a_role'))}</label>
        <div class="rolepick" id="rolepick">
          ${Rules_roles.map((r) => `
            <button type="button" class="${regRole === r ? 'on' : ''}" style="--c:${ROLE_META[r].color}"
                    onclick="pickRole('${r}')">
              <span class="e">${ROLE_META[r].emoji}</span>
              <span><span class="n">${esc(rl(r))}</span><br><span class="d">${esc(t('rd_' + r))}</span></span>
            </button>`).join('')}
        </div>
      </div>
      <div class="field"><label>${esc(t('a_name'))}</label>
        <input id="rg_name" autocomplete="name" required></div>
      <div class="field"><label>${esc(t('a_email'))}</label>
        <input id="rg_email" type="email" autocomplete="username" required></div>
      <div class="field"><label>${esc(t('a_pass'))}</label>
        <input id="rg_pass" type="password" autocomplete="new-password" minlength="8" required>
        <div class="muted" style="font-size:12px;margin-top:4px">${esc(t('a_passHint'))}</div></div>
      <div class="field"><label>${esc(t('a_company'))}</label><input id="rg_company"></div>
      <div class="field"><label>${esc(t('a_phone'))}</label><input id="rg_phone"></div>
      <button class="btn btn-primary" type="submit">${esc(t('a_register'))}</button>
    </form>
    <div class="authswap">${esc(t('a_hasAcc'))} <a href="#/login">${esc(t('a_login'))}</a></div>
    <div class="authswap"><a href="#/">${esc(t('a_backHome'))}</a></div>`);
}

const Rules_roles = ['author', 'maker', 'investor', 'seller'];

function pickRole(r) {
  regRole = r;
  $$('#rolepick button').forEach((b, i) => b.classList.toggle('on', Rules_roles[i] === r));
}

function formError(key) {
  const el = $('#formerr');
  if (el) el.innerHTML = key ? `<div class="formerr">${esc(t(key))}</div>` : '';
}

async function doLogin(e) {
  e.preventDefault();
  formError('');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await API.login(val('lg_email'), val('lg_pass'));
    S.me = await API.me();
    if (S.me.lang) setLang(S.me.lang, false);
    go('#/app');
    render();
  } catch (err) {
    formError(err.key || 'e_network');
  } finally {
    btn.disabled = false;
  }
}

async function doRegister(e) {
  e.preventDefault();
  formError('');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    await API.register({
      email: val('rg_email'), password: val('rg_pass'), fullName: val('rg_name'),
      role: regRole, company: val('rg_company'), phone: val('rg_phone'), lang: S.lang,
    });
    S.me = await API.me();
    go('#/app');
    render();
  } catch (err) {
    formError(err.key || 'e_network');
  } finally {
    btn.disabled = false;
  }
}

async function doLogout() {
  try { await API.logout(); } catch (_) { /* onsuz da çıxırıq */ }
  S.demo = null;
  S.realMe = null;
  try { sessionStorage.removeItem('if_demo'); } catch (_) { /* gizli rejim */ }
  S.me = null;
  S.notifs = [];
  go('#/');
  render();
}

/* ========================== GÖZLƏMƏ EKRANI ========================== */
function waitView() {
  const map = {
    pending: ['⏳', 'w_pendTitle', 'w_pendText'],
    blocked: ['⛔', 'w_blockTitle', 'w_blockText'],
    rejected: ['✕', 'w_rejTitle', 'w_blockText'],
  };
  const [em, title, text] = map[S.me.status] || map.pending;
  return `
  <div class="authtop" style="position:static;padding:18px;justify-content:flex-end;display:flex">
    <button class="btn btn-ghost btn-sm" onclick="cycleLang()">${S.lang.toUpperCase()}</button>
    <button class="btn btn-ghost btn-sm" onclick="doLogout()">${esc(t('a_logout'))}</button>
  </div>
  <div class="waitbox">
    <div class="em">${em}</div>
    <h2>${esc(t(title))}</h2>
    <p>${esc(t(text))}</p>
    <p class="muted" style="margin-top:14px;font-size:13px">${esc(S.me.email)} · ${esc(rl(S.me.role))}</p>
    <button class="btn btn-ghost btn-sm" style="margin-top:18px" onclick="recheck()">${esc(t('w_refresh'))}</button>
  </div>`;
}

async function recheck() {
  try { S.me = await API.me(); } catch (_) { S.me = null; }
  render();
}

/* =============================== KABİNET =============================== */
async function dashboardView() {
  const [dash, projects, notifs] = await Promise.all([
    API.get('/dashboard'),
    API.get('/projects' + (S.me.role === 'author' ? '?mine=1' : '')),
    API.get('/notifications').catch(() => []),
  ]);
  const tiles = dash.tiles;
  const r = S.me.role;

  const tileSets = {
    author: [
      [tiles.projects, 'd_a_t1'], [tiles.avgRating || '—', 'd_a_t2'],
      [tiles.offers, 'd_a_t3'], [num(tiles.preorders), 'd_a_t4'],
    ],
    maker: [
      [tiles.requests, 'd_m_t1'], [tiles.myOffers, 'd_m_t2'],
      [tiles.won, 'd_m_t3'], [dash.trust, 'd_m_t4'],
    ],
    investor: [
      [tiles.seeking, 'd_i_t1'], [tiles.portfolio, 'd_i_t2'],
      [money(tiles.invested), 'd_i_t3'], [tiles.pending, 'd_i_t4'],
    ],
    seller: [
      [tiles.pipeline, 'd_s_t1'], [num(tiles.myPreorders), 'd_s_t2'],
      [tiles.reserved, 'd_s_t3'], [tiles.onSale, 'd_s_t4'],
    ],
    admin: [
      [tiles.pendingUsers, 'ad_pendingUsers'], [tiles.pendingProjects, 'ad_pendingProjects'],
      [tiles.activeUsers, 'ad_activeUsers'], [tiles.deals, 'ad_deals'],
    ],
  };
  const titles = {
    author: ['d_a_title', 'd_a_sub'], maker: ['d_m_title', 'd_m_sub'],
    investor: ['d_i_title', 'd_i_sub'], seller: ['d_s_title', 'd_s_sub'],
    admin: ['ad_title', 'ad_sub'],
  };
  const [tk, sk] = titles[r] || titles.author;
  const listTitle = { author: 'd_a_my', maker: 'd_m_reqs', investor: 'd_i_feed', seller: 'd_s_catalog' }[r] || 'c_title';

  const statIcons = {
    author: ['grid', 'star', 'factory', 'store'], maker: ['box', 'tag', 'check', 'shield'],
    investor: ['trending', 'grid', 'coins', 'sparkles'], seller: ['box', 'store', 'check', 'tag'],
    admin: ['users', 'grid', 'check', 'coins'],
  };
  const meta = ROLE_META[r] || ROLE_META.author;
  const first = String(S.me.fullName || '').split(/\s+/)[0];
  const today = new Date().toLocaleDateString(S.lang === 'en' ? 'en-GB' : S.lang === 'ru' ? 'ru-RU' : 'az-AZ', { weekday: 'long' });
  const quick = navList().filter(([href]) => href !== '#/app').slice(0, 4);
  const list = [...(S.demo ? [] : [journey(Demo.example(), true)]), ...projects.slice(0, 8).map((p) => journey(p))];

  return `
  <section class="welcome" style="--c:${meta.color}">
    <div class="wtext">
      <span class="wkick">${esc(today)} · ${esc(t(tk))}</span>
      <h1>${esc(tf('d_hello', { name: first }))} 👋</h1>
      <p>${esc(t(sk))}</p>
      <div class="wcta">
        ${r === 'author' ? `<a class="btn btn-primary" href="#/new">${icon('plus', 18)} ${esc(t('nav_new'))}</a>` : ''}
        <a class="btn btn-ghost" href="#/projects">${icon('grid', 18)} ${esc(t('c_title'))}</a>
      </div>
    </div>
    <div class="wart" aria-hidden="true"><span>${meta.emoji}</span></div>
  </section>

  <div class="stats">
    ${(tileSets[r] || []).map(([v, k], i) => `
      <div class="stat">
        <span class="sic">${icon((statIcons[r] || statIcons.author)[i], 20)}</span>
        <div><b>${esc(String(v))}</b><span>${esc(t(k))}</span></div>
      </div>`).join('')}
  </div>

  <div class="dash">
    <div class="dmain">
      <div class="sechead"><h2>${esc(t(listTitle))}</h2>
        <a href="#/projects">${esc(t('d_all'))} ${icon('arrow', 16)}</a></div>
      ${list.length ? `<div class="journeys">${list.join('')}</div>` : `<div class="empty">${esc(t('c_empty'))}</div>`}
    </div>
    <aside class="dside">
      <div class="card">
        <h3>${icon('bell', 18)} ${esc(t('d_activity'))}</h3>
        ${notifs.length ? `<ul class="feed">${notifs.slice(0, 6).map((n) => `
          <li ${n.projectId ? `onclick="go('#/project/${n.projectId}')"` : ''}>
            <span class="dot"></span>
            <div><b>${esc(t(n.key))}</b><small>${esc(n.title)} · ${fdate(n.at)}</small></div>
          </li>`).join('')}</ul>` : `<p class="muted" style="font-size:13.5px">${esc(t('n_empty'))}</p>`}
      </div>
      <div class="card">
        <h3>${icon('sparkles', 18)} ${esc(t('d_quick'))}</h3>
        <div class="quick">${quick.map(([href, k, i]) => `
          <a href="${href}"><span>${icon(i, 18)}</span>${esc(t(k))}</a>`).join('')}</div>
      </div>
    </aside>
  </div>`;
}

/* «Məhsul yolu» kartı: ideya → istehsalçı → satışa hazır → satıcı (→ investor).
   Sağda mərhələ üzrə irəliləyiş halqası. example=true — nümunə, real layihə deyil. */
function journey(p, example = false) {
  const [bg, em] = COVERS[p.category] || ['#EEE', '📦'];
  // Satışa hazır: nümunədə birbaşa verilir, real layihədə «Satış» mərhələsində
  // qəbul edilmiş istehsal təklifinin həcmi.
  const ready = p.stock || (p.status === 'sales' ? p.makerQty : 0) || 0;
  const maker = p.makerCompany || p.makerName;
  const node = (ic, label, value, done) => `
    <div class="jn ${done ? 'done' : ''}">
      <span class="jni">${icon(ic, 16)}</span>
      <div><small>${esc(label)}</small><b>${value}</b></div>
    </div>`;
  const none = esc(t('j_none'));
  const nodes = [
    node('bulb', t('j_idea'), esc(p.authorName), true),
    node('factory', t('j_maker'), maker ? esc(maker) : esc(t('j_findMaker')), !!maker),
    node('box', t('j_ready'), ready ? `${num(ready)} ${esc(t('j_units'))}` : none, !!ready),
    node('store', t('j_seller'), p.demand ? `${num(p.demand)} ${esc(t('j_units'))}` : none, !!p.demand),
  ];
  if (Number(p.invested)) nodes.push(node('trending', t('j_investor'), money(p.invested), true));

  return `
  <article class="jcard ${example ? 'example' : ''}" ${example ? (S.me ? `onclick="go('#/project/ex')" style="cursor:pointer"` : '') : `onclick="go('#/project/${p.id}')" tabindex="0" onkeydown="if(event.key==='Enter')go('#/project/${p.id}')"`}>
    <div class="jcov" style="background:${bg}">${em}</div>
    <div class="jbody">
      <div class="jtitle"><h3>${esc(p.title)}</h3>
        ${example ? `<span class="jex">${esc(t('j_example'))}</span>` : badge(p.status)}</div>
      <div class="jnodes">${nodes.join('')}</div>
    </div>
    <div class="jprog">${ring(stageProgress(p.status), 58, example || p.status === 'sales' ? 'var(--accent-2)' : 'var(--accent)')}</div>
  </article>`;
}

function pcard(p) {
  const [bg, em] = COVERS[p.category] || ['#EEE', '📦'];
  return `
  <div class="pcard ${p.example ? 'example' : ''}" onclick="go('#/project/${p.id}')">
    <div class="cover" style="background:${bg}">${em}${p.example ? `<span class="jex pex">${esc(t('j_example'))}</span>` : ''}</div>
    <div class="pb">
      <h4>${esc(p.title)}</h4>
      <div class="meta">${esc(t('p_author'))}: ${esc(p.authorName)} · ${esc(catL(p.category))}</div>
      <div class="foot">${badge(p.status)}${stars(p.rating)}</div>
      <div class="meta" style="margin:8px 0 0">
        ${p.price ? money(p.price) : '—'} · ${t('d_a_t4')}: ${num(p.demand)}${p.interest ? ` · 🙋 ${num(p.interest)}` : ''}${p.stock ? ` · 📦 ${num(p.stock)} ${esc(t('ab_stockShort'))}` : ''}
        ${p.offerCount ? ` · ${p.offerCount} ${t('d_m_t2')}` : ''}
      </div>
      <div class="pprog" title="${stageProgress(p.status)}%"><i style="width:${stageProgress(p.status)}%"></i></div>
    </div>
  </div>`;
}

/* ============================== KATALOQ ============================== */
async function projectsView() {
  const q = S.search ? '&q=' + encodeURIComponent(S.search) : '';
  const real = await API.get(`/projects?cat=${encodeURIComponent(S.filterCat)}${q}`);
  // Pryzma nümunəsi kataloqda da görünür — kateqoriya və axtarış filtrlərinə tabe olaraq.
  const ex = S.demo ? null : Demo.exampleDetail();
  const showEx = ex && (S.filterCat === 'all' || S.filterCat === ex.category) &&
    (!S.search || ex.title.toLowerCase().includes(S.search.toLowerCase()));
  const list = showEx ? [ex, ...real] : real;
  const cats = ['all', ...CATS];
  return `
  <div class="page-h"><div><h1>${esc(t('c_title'))}</h1><p>${esc(t('c_sub'))}</p></div></div>
  <div class="searchbar">
    <input id="catsearch" placeholder="${esc(t('c_search'))}" value="${esc(S.search)}"
           onkeydown="if(event.key==='Enter'){S.search=this.value;render()}">
    <button class="btn btn-ghost btn-sm" onclick="S.search=val('catsearch');render()">🔍</button>
  </div>
  <div class="filters">
    ${cats.map((c) => `<button class="chipf ${S.filterCat === c ? 'on' : ''}"
      onclick="S.filterCat='${c}';render()">${esc(catL(c))}</button>`).join('')}
  </div>
  ${list.length
      ? `<div class="grid g3">${list.map(pcard).join('')}</div>`
      : `<div class="empty">${esc(t('c_empty'))}</div>`}`;
}

/* =========================== YENİ LAYİHƏ =========================== */
async function newProjectView() {
  return `
  <div class="page-h"><div><h1>${esc(t('n_title'))}</h1><p>${esc(t('n_sub'))}</p></div></div>
  <div class="card" style="max-width:640px">
    <div id="formerr"></div>
    <form onsubmit="createProject(event)">
      <div class="field"><label>${esc(t('n_name'))}</label>
        <input id="np_title" placeholder="${esc(t('n_namePh'))}" required></div>
      <div class="field"><label>${esc(t('n_cat'))}</label>
        <select id="np_cat">${CATS.map((c) => `<option value="${c}">${esc(catL(c))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('n_desc'))}</label>
        <textarea id="np_descr" rows="5" placeholder="${esc(t('n_descPh'))}"></textarea></div>
      <div class="grid g2">
        <div class="field"><label>${esc(t('n_price'))}</label><input id="np_price" type="number" step="0.01" min="0"></div>
        <div class="field"><label>${esc(t('ai_cost'))}</label><input id="np_cost" type="number" step="0.01" min="0"></div>
      </div>
      <div class="field"><label>MOQ</label><input id="np_moq" type="number" min="0"></div>
      <p class="muted" style="font-size:12.5px;margin:-4px 0 14px">ℹ️ ${esc(t('roy_adminNote'))}</p>
      <button class="btn btn-primary" type="submit">${esc(t('n_create'))}</button>
    </form>
  </div>`;
}

async function createProject(e) {
  e.preventDefault();
  formError('');
  try {
    const res = await API.post('/projects', {
      title: val('np_title'), descr: val('np_descr'), category: val('np_cat'),
      price: numVal('np_price'), unitCost: numVal('np_cost'),
      moq: numVal('np_moq'),
    });
    toast(t('ts_created'));
    go('#/project/' + res.id);
  } catch (err) {
    formError(err.key || 'e_network');
  }
}

/* ===================== İSTEHSALÇI / İNVESTOR SİYAHISI ===================== */
async function directoryView(role) {
  const real = await API.get('/directory/' + role);
  // İstehsalçılar siyahısında Pryzma nümunəsinin istehsalçısı da göstərilir (demo rejimində o onsuz da var).
  const list = role === 'maker' && !S.demo ? [Demo.exampleMaker(), ...real] : real;
  const title = role === 'maker' ? 'mk_title' : 'in_title';
  const sub = role === 'maker' ? 'mk_sub' : 'in_sub';
  const ic = role === 'maker' ? 'factory' : 'trending';
  return `
  <div class="page-h"><div><h1>${esc(t(title))}</h1><p>${esc(t(sub))}</p></div></div>
  ${list.length ? `<div class="grid g3">${list.map((m) => `
    <div class="card dircard ${m.example ? 'example' : ''}">
      <div class="dirhead">
        <span class="av" style="--c:${role === 'maker' ? 'var(--maker)' : 'var(--investor)'}">${icon(ic, 20)}</span>
        <div style="min-width:0;flex:1"><h3>${esc(m.company || m.name)}</h3>
          <p class="muted" style="font-size:13px">${esc(m.company ? m.name : '—')}</p></div>
        ${m.example ? `<span class="jex">${esc(t('j_example'))}</span>` : ''}
      </div>
      <div class="kv"><span>${esc(t('ad_trust'))}</span><b>${trustBar(m.trust)}</b></div>
      <div class="kv"><span>${esc(t('an_t3'))}</span><b>${m.deals}</b></div>
      ${m.example ? `<a class="btn btn-ghost btn-sm" style="margin-top:10px;width:100%" href="#/project/ex">
        👕 ${esc(Demo.example().title)}</a>` : ''}
    </div>`).join('')}</div>` : `<div class="empty">${esc(t('c_empty'))}</div>`}`;
}

/* ============================== TARİFLƏR ============================== */
async function pricingView() {
  const s = await API.get('/settings/public');
  const fee = (k) => esc(s[k] || '0') + '%';
  return `
  <div class="page-h"><div><h1>${esc(t('pc_title'))}</h1><p>${esc(t('pc_sub'))}</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>${esc(t('pc_rev'))}</h3>
      <div class="kv"><span>${esc(t('pc_c1'))}</span><b>${fee('fee_production')}</b></div>
      <div class="kv"><span>${esc(t('pc_c2'))}</span><b>${fee('fee_investment')}</b></div>
      <div class="kv"><span>${esc(t('pc_c3'))}</span><b>${fee('fee_sales')}</b></div>
      <div class="kv"><span>${esc(t('pc_c4'))}</span><b>${fee('fee_escrow')}</b></div>
      <div class="kv"><span>${esc(t('pc_c5'))}</span><b>${fee('fee_partner')}</b></div>
    </div>
    <div class="card"><h3>${esc(t('pc_subs'))}</h3>
      <div class="kv"><span>${esc(t('pc_authorPro'))}</span><b>$${esc(s.sub_author)}</b></div>
      <div class="kv"><span>${esc(rl('maker'))}</span><b>$${esc(s.sub_maker)}</b></div>
      <div class="kv"><span>${esc(rl('investor'))}</span><b>$${esc(s.sub_investor)}</b></div>
      <div class="kv"><span>${esc(rl('seller'))}</span><b>$${esc(s.sub_seller)}</b></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h3>${esc(t('pc_wf'))}</h3>
    <div class="bar">
      <div class="seg" style="background:var(--platform);width:5%">5%</div>
      <div class="seg" style="background:var(--author);width:8%">8%</div>
      <div class="seg" style="background:var(--investor);width:26%">26%</div>
      <div class="seg" style="background:var(--seller);width:61%">61%</div>
    </div>
    <p class="muted" style="font-size:12.5px">${esc(t('pc_wfNote'))}</p>
  </div>`;
}

/* ============================== ANALİTİKA ============================== */
async function analyticsView() {
  // Tam platforma statistikası yalnız adminə açıqdır; qalan rollar üçün
  // analitika onlara görünən kataloqdan qurulur.
  if (S.me.role !== 'admin') return await analyticsFromCatalog();
  const st = await API.get('/admin/stats');

  const funnel = st.funnel;
  const fmax = Math.max(...funnel.map((f) => f.count), 1);
  const cats = Object.entries(st.projByCat);
  const cmax = Math.max(...cats.map(([, v]) => v), 1);
  const months = st.dealsByMonth;

  return `
  <div class="page-h"><div><h1>${esc(t('an_title'))}</h1><p>${esc(t('an_sub'))}</p></div></div>
  <div class="tiles">
    <div class="tile"><div class="v">${st.totals.projects}</div><div class="k">${esc(t('an_t1'))}</div></div>
    <div class="tile"><div class="v">${money(st.money.invested)}</div><div class="k">${esc(t('an_t2'))}</div></div>
    <div class="tile"><div class="v">${(st.projByStatus.deal || 0) + (st.projByStatus.prod || 0) + (st.projByStatus.sales || 0)}</div><div class="k">${esc(t('an_t3'))}</div></div>
    <div class="tile"><div class="v">${st.totals.users}</div><div class="k">${esc(t('ad_users'))}</div></div>
  </div>
  <div class="card"><h3>${esc(t('an_funnel'))}</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">${esc(t('an_funnelSub'))}</p>
    ${funnel.map((f) => chartRow(t('tl_' + f.status) || f.status, f.count, fmax, 'var(--accent)')).join('')}
  </div>
  <div class="card" style="margin-top:14px"><h3>${esc(t('an_cats'))}</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">${esc(t('an_catsSub'))}</p>
    ${cats.length ? cats.map(([k, v]) => chartRow(catL(k), v, cmax, 'var(--accent-2)')).join('')
      : `<div class="empty">${esc(t('c_empty'))}</div>`}
  </div>
  <div class="card" style="margin-top:14px"><h3>${esc(t('an_deals'))}</h3>
    <p class="muted" style="font-size:13px">${esc(t('an_dealsSub'))}</p>
    ${lineChart(months.map((m) => m.month.slice(5)), months.map((m) => m.count))}
  </div>`;
}

/* Admin olmayan rollar üçün analitika kataloq məlumatından qurulur. */
async function analyticsFromCatalog() {
  const list = await API.get('/projects');
  const byStatus = {};
  const byCat = {};
  list.forEach((p) => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    byCat[p.category] = (byCat[p.category] || 0) + 1;
  });
  const fmax = Math.max(...Object.values(byStatus), 1);
  const cmax = Math.max(...Object.values(byCat), 1);
  return `
  <div class="page-h"><div><h1>${esc(t('an_title'))}</h1><p>${esc(t('an_sub'))}</p></div></div>
  <div class="card"><h3>${esc(t('an_funnel'))}</h3>
    ${FLOW.map((s) => chartRow(t('tl_' + s), byStatus[s] || 0, fmax, 'var(--accent)')).join('')}
  </div>
  <div class="card" style="margin-top:14px"><h3>${esc(t('an_cats'))}</h3>
    ${Object.entries(byCat).map(([k, v]) => chartRow(catL(k), v, cmax, 'var(--accent-2)')).join('')
      || `<div class="empty">${esc(t('c_empty'))}</div>`}
  </div>`;
}

/* =============================== PROFİL =============================== */
async function profileView() {
  const m = S.me;
  return `
  <div class="page-h"><div><h1>${esc(t('pf_title'))}</h1><p>${esc(m.email)}</p></div></div>
  <div class="grid g2">
    <div class="card">
      <h3>${esc(m.fullName)}</h3>
      <div class="kv"><span>${esc(t('a_role'))}</span><b>${esc(rl(m.role))}</b></div>
      <div class="kv"><span>${esc(t('a_company'))}</span><b>${esc(m.company || '—')}</b></div>
      <div class="kv"><span>${esc(t('ad_trust'))}</span><b>${trustBar(m.trust)}</b></div>
      <div class="kv"><span>${esc(t('top_lang'))}</span><b>${S.lang.toUpperCase()}</b></div>
    </div>
    <div class="card">
      <h3>${esc(t('pf_changePass'))}</h3>
      <div id="formerr"></div>
      <form onsubmit="changePass(event)">
        <div class="field"><label>${esc(t('pf_oldPass'))}</label>
          <input id="pf_old" type="password" autocomplete="current-password" required></div>
        <div class="field"><label>${esc(t('pf_newPass'))}</label>
          <input id="pf_new" type="password" autocomplete="new-password" minlength="8" required></div>
        <button class="btn btn-primary btn-sm" type="submit">${esc(t('ad_save'))}</button>
      </form>
    </div>
  </div>`;
}

async function changePass(e) {
  e.preventDefault();
  formError('');
  try {
    await API.post('/me/password', { old: val('pf_old'), new: val('pf_new') });
    toast(t('pf_passChanged'));
    render();
  } catch (err) {
    formError(err.key || 'e_network');
  }
}
