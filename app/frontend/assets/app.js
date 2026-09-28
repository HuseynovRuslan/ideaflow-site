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

  if (first === 'project' && parts[1]) return void (await renderProject(Number(parts[1]), token));

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

function navItems() {
  const r = S.me.role;
  const items = [['#/app', 'nav_overview', '▦'], ['#/projects', 'nav_projects', '▤']];
  if (r === 'author') items.push(['#/new', 'nav_new', '＋']);
  if (r === 'investor' || r === 'admin') items.push(['#/investors', 'nav_investors', '◆']);
  if (r === 'maker' || r === 'admin' || r === 'author') items.push(['#/makers', 'nav_makers', '◆']);
  items.push(['#/analytics', 'nav_analytics', '📊']);
  items.push(['#/pricing', 'nav_pricing', '₮']);
  if (r === 'admin') items.push(['#/admin', 'nav_admin', '🛡']);
  const h = location.hash || '#/app';
  return items.map(([href, k, i]) =>
    `<a href="${href}" class="${h === href || h.startsWith(href + '/') ? 'on' : ''}">
       <span class="i">${i}</span>${esc(t(k))}</a>`).join('');
}

function shell(inner) {
  const meta = ROLE_META[S.me.role] || ROLE_META.author;
  const nCount = S.notifs.length;
  $('#app').innerHTML = `
  <div class="topbar">
    <a class="logo" href="#/app"><span class="m">${logoSvg()}</span>IdeaFlow</a>
    <div class="spacer"></div>
    <div class="roleSel">
      <span class="badge" style="background:${meta.color}1f;color:${meta.color}">
        ${meta.emoji} ${esc(rl(S.me.role))}
      </span>
    </div>
    <button class="ticon" onclick="cycleLang()" title="${t('top_lang')}"
            style="font-size:12px;font-weight:800">${S.lang.toUpperCase()}</button>
    <button class="ticon" onclick="toggleTheme()" title="${t('top_theme')}">${S.theme === 'dark' ? '☀️' : '🌙'}</button>
    <button class="bell" onclick="toggleNotifs()">🔔${nCount ? `<span class="cnt">${nCount > 99 ? '99+' : nCount}</span>` : ''}</button>
    ${S.showN ? notifDropdown() : ''}
  </div>
  <div class="layout">
    <div class="side">
      <div class="grp">${esc(t('nav_menu'))}</div>
      ${navItems()}
      <div class="grp">${esc(t('pf_title'))}</div>
      <a href="#/profile" class="${(location.hash || '') === '#/profile' ? 'on' : ''}">
        <span class="i">👤</span>${esc(S.me.fullName)}</a>
      <a onclick="doLogout()"><span class="i">⎋</span>${esc(t('a_logout'))}</a>
    </div>
    <div class="content" id="content">${inner}</div>
  </div>`;
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
        bell.innerHTML = `🔔${list.length ? `<span class="cnt">${list.length > 99 ? '99+' : list.length}</span>` : ''}`;
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
function landingView() {
  const roles = ['author', 'maker', 'investor', 'seller'];
  return `
  <div class="authtop">
    <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#EAF1F6"
            onclick="cycleLang()">${S.lang.toUpperCase()}</button>
    <a class="btn btn-ghost btn-sm" href="#/login"
       style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#EAF1F6">${t('a_login')}</a>
  </div>
  <div class="hero">
    <span class="pill">${esc(t('l_pill'))}</span>
    <h1>${esc(t('l_h1a'))} <span class="g">${esc(t('l_h1b'))}</span></h1>
    <p>${esc(t('l_sub'))}</p>
    <a class="btn btn-primary" href="#/register">${esc(t('a_register'))}</a>
  </div>
  <div class="enter">
    <div class="enterCard">
      <h3 style="font-size:19px">${esc(t('l_enterTitle'))}</h3>
      <p class="muted" style="font-size:13.5px;margin-top:4px">${esc(t('a_regSub'))}</p>
      <div class="roles">
        ${roles.map((r) => `
          <a class="rbtn" style="--c:${ROLE_META[r].color}" href="#/register/${r}">
            <div class="ic">${ROLE_META[r].emoji}</div>
            <h4>${esc(rl(r))}</h4>
            <p>${esc(t('rd_' + r))}</p>
          </a>`).join('')}
      </div>
      <div class="authswap">${esc(t('a_hasAcc'))} <a href="#/login">${esc(t('a_login'))}</a></div>
    </div>
  </div>`;
}

/* =========================== GİRİŞ / QEYDİYYAT =========================== */
function authChrome(inner) {
  return `<div class="authwrap">
    <div class="authtop">
      <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#EAF1F6"
              onclick="cycleLang()">${S.lang.toUpperCase()}</button>
    </div>
    <div class="authcard">
      <div class="brand"><span class="m">${logoSvg()}</span>IdeaFlow</div>
      ${inner}
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
  const [dash, projects] = await Promise.all([
    API.get('/dashboard'),
    API.get('/projects' + (S.me.role === 'author' ? '?mine=1' : '')),
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

  return `
  <div class="page-h">
    <div><h1>${esc(t(tk))}</h1><p>${esc(t(sk))}</p></div>
    ${r === 'author' ? `<a class="btn btn-primary" href="#/new">${esc(t('btn_newIdea'))}</a>` : ''}
  </div>
  <div class="tiles">
    ${(tileSets[r] || []).map(([v, k]) =>
      `<div class="tile"><div class="v">${esc(String(v))}</div><div class="k">${esc(t(k))}</div></div>`).join('')}
  </div>
  <h3 style="margin:8px 0 12px;font-size:17px">${esc(t(listTitle))}</h3>
  ${projects.length
      ? `<div class="grid g3">${projects.slice(0, 9).map(pcard).join('')}</div>`
      : `<div class="empty">${esc(t('c_empty'))}</div>`}
  ${projects.length > 9 ? `<div style="margin-top:16px"><a class="btn btn-ghost btn-sm" href="#/projects">${esc(t('c_title'))} →</a></div>` : ''}`;
}

function pcard(p) {
  const [bg, em] = COVERS[p.category] || ['#EEE', '📦'];
  return `
  <div class="pcard" onclick="go('#/project/${p.id}')">
    <div class="cover" style="background:${bg}">${em}</div>
    <div class="pb">
      <h4>${esc(p.title)}</h4>
      <div class="meta">${esc(t('p_author'))}: ${esc(p.authorName)} · ${esc(catL(p.category))}</div>
      <div class="foot">${badge(p.status)}${stars(p.rating)}</div>
      <div class="meta" style="margin:8px 0 0">
        ${p.price ? money(p.price) : '—'} · ${t('d_a_t4')}: ${num(p.demand)}
        ${p.offerCount ? ` · ${p.offerCount} ${t('d_m_t2')}` : ''}
      </div>
    </div>
  </div>`;
}

/* ============================== KATALOQ ============================== */
async function projectsView() {
  const q = S.search ? '&q=' + encodeURIComponent(S.search) : '';
  const list = await API.get(`/projects?cat=${encodeURIComponent(S.filterCat)}${q}`);
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
      <div class="grid g2">
        <div class="field"><label>MOQ</label><input id="np_moq" type="number" min="0"></div>
        <div class="field"><label>${esc(t('f_royalty'))} (%)</label><input id="np_royalty" type="number" min="0" max="50" value="8"></div>
      </div>
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
      moq: numVal('np_moq'), royalty: numVal('np_royalty'),
    });
    toast(t('ts_created'));
    go('#/project/' + res.id);
  } catch (err) {
    formError(err.key || 'e_network');
  }
}

/* ===================== İSTEHSALÇI / İNVESTOR SİYAHISI ===================== */
async function directoryView(role) {
  const list = await API.get('/directory/' + role);
  const title = role === 'maker' ? 'mk_title' : 'in_title';
  const sub = role === 'maker' ? 'mk_sub' : 'in_sub';
  return `
  <div class="page-h"><div><h1>${esc(t(title))}</h1><p>${esc(t(sub))}</p></div></div>
  ${list.length ? `<div class="grid g3">${list.map((m) => `
    <div class="card">
      <h3>${esc(m.name)}</h3>
      <p class="muted" style="font-size:13px">${esc(m.company || '—')}</p>
      <div style="margin-top:10px;font-size:13px">
        🛡 ${esc(t('ad_trust'))}: ${trustBar(m.trust)}
      </div>
      <div class="muted" style="font-size:12.5px;margin-top:6px">${m.deals} ${esc(t('an_t3'))}</div>
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
