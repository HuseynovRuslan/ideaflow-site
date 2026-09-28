/* ==========================================================================
   Admin paneli — istifadəçi təsdiqi, layihə nəzarəti, hesabatlar, audit,
   platforma parametrləri. Yalnız 'admin' rolu üçün açılır.
   ========================================================================== */

const ADMIN_TABS = [
  ['', 'ad_overview'], ['users', 'ad_users'], ['projects', 'ad_projects'],
  ['audit', 'ad_audit'], ['settings', 'ad_settings'],
];

const A = { userStatus: 'all', userRole: 'all', userQ: '' };

async function renderAdmin(parts, token) {
  if (S.me.role !== 'admin') { go('#/app'); return; }
  const sub = parts[0] || '';

  shell(`<div class="loading">${t('g_loading')}</div>`);
  const head = `
    <div class="page-h"><div><h1>${esc(t('ad_title'))}</h1><p>${esc(t('ad_sub'))}</p></div></div>
    <div class="tabs">
      ${ADMIN_TABS.map(([k, label]) => `
        <button class="${sub === k ? 'on' : ''}" onclick="go('#/admin${k ? '/' + k : ''}')">
          ${esc(t(label))}</button>`).join('')}
    </div>
    <div id="adminbody"><div class="loading">${t('g_loading')}</div></div>`;
  setContent(head);

  try {
    const body = await ({
      '': adminOverview, users: adminUsers, projects: adminProjects,
      audit: adminAudit, settings: adminSettings,
    }[sub] || adminOverview)();
    if (token !== S.renderToken) return;
    const el = document.getElementById('adminbody');
    if (el) el.innerHTML = body;
  } catch (err) {
    if (token !== S.renderToken) return;
    const el = document.getElementById('adminbody');
    if (el) el.innerHTML = `<div class="empty">${esc(t(err.key || 'e_network'))}</div>`;
  }
  refreshNotifs();
}

/* Cari admin alt-səhifəsini yenidən yükləyir. */
function reloadAdmin() {
  const { parts } = parseHash();
  return renderAdmin(parts.slice(1), S.renderToken);
}

/* ============================== İCMAL ============================== */
async function adminOverview() {
  const st = await API.get('/admin/stats');
  const funnel = st.funnel;
  const fmax = Math.max(...funnel.map((f) => f.count), 1);
  const cats = Object.entries(st.projByCat);
  const cmax = Math.max(...cats.map(([, v]) => v), 1);
  const roles = Object.entries(st.usersByRole);
  const rmax = Math.max(...roles.map(([, v]) => v), 1);

  return `
  <div class="tiles">
    <div class="tile"><div class="v">${st.totals.pendingUsers}</div><div class="k">${esc(t('ad_pendingUsers'))}</div></div>
    <div class="tile"><div class="v">${st.totals.pendingProjects}</div><div class="k">${esc(t('ad_pendingProjects'))}</div></div>
    <div class="tile"><div class="v">${st.usersByStatus.active || 0}</div><div class="k">${esc(t('ad_activeUsers'))}</div></div>
    <div class="tile"><div class="v">${money(st.money.invested)}</div><div class="k">${esc(t('an_t2'))}</div></div>
  </div>
  ${st.totals.pendingUsers ? `
    <div class="card" style="margin-bottom:14px;border-color:var(--maker)">
      <h3>⏳ ${st.totals.pendingUsers} ${esc(t('ad_pendingUsers'))}</h3>
      <button class="btn btn-primary btn-sm" style="margin-top:10px"
              onclick="A.userStatus='pending';go('#/admin/users')">${esc(t('ad_users'))} →</button>
    </div>` : ''}
  <div class="grid g2">
    <div class="card"><h3>${esc(t('an_funnel'))}</h3>
      ${funnel.map((f) => chartRow(t('tl_' + f.status), f.count, fmax, 'var(--accent)')).join('')}
    </div>
    <div class="card"><h3>${esc(t('an_cats'))}</h3>
      ${cats.length ? cats.map(([k, v]) => chartRow(catL(k), v, cmax, 'var(--accent-2)')).join('')
        : `<div class="empty">${esc(t('c_empty'))}</div>`}
    </div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>${esc(t('ad_users'))}</h3>
      ${roles.map(([k, v]) => chartRow(rl(k), v, rmax, (ROLE_META[k] || {}).color || 'var(--accent)')).join('')}
    </div>
    <div class="card"><h3>${esc(t('an_deals'))}</h3>
      ${lineChart(st.dealsByMonth.map((m) => m.month.slice(5)), st.dealsByMonth.map((m) => m.count))}
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h3>${esc(t('pc_sub'))}</h3>
    <div class="kv"><span>${esc(t('an_t2'))}</span><b>${money(st.money.invested)}</b></div>
    <div class="kv"><span>${esc(t('d_s_t2'))} × ${esc(t('f_price'))}</span><b>${money(st.money.pipeline)}</b></div>
  </div>`;
}

/* =========================== İSTİFADƏÇİLƏR =========================== */
async function adminUsers() {
  const qs = `?status=${A.userStatus}&role=${A.userRole}` +
             (A.userQ ? '&q=' + encodeURIComponent(A.userQ) : '');
  const list = await API.get('/admin/users' + qs);
  const statuses = ['all', 'pending', 'active', 'blocked', 'rejected'];
  const roles = ['all', 'author', 'maker', 'investor', 'seller', 'admin'];

  return `
  <div class="searchbar">
    <input id="adm_q" placeholder="${esc(t('ad_search'))}" value="${esc(A.userQ)}"
           onkeydown="if(event.key==='Enter'){A.userQ=this.value;reloadAdmin()}">
    <button class="btn btn-ghost btn-sm" onclick="A.userQ=val('adm_q');reloadAdmin()">🔍</button>
  </div>
  <div class="filters">
    ${statuses.map((s) => `<button class="chipf ${A.userStatus === s ? 'on' : ''}"
      onclick="A.userStatus='${s}';reloadAdmin()">${esc(s === 'all' ? t('ad_filterAll') : t('ad_st_' + s))}</button>`).join('')}
  </div>
  <div class="filters">
    ${roles.map((r) => `<button class="chipf ${A.userRole === r ? 'on' : ''}"
      onclick="A.userRole='${r}';reloadAdmin()">${esc(r === 'all' ? t('ad_filterAll') : rl(r))}</button>`).join('')}
  </div>
  ${list.length ? `
  <div class="tablewrap"><table class="tbl">
    <thead><tr>
      <th>${esc(t('a_name'))}</th><th>${esc(t('a_role'))}</th><th>${esc(t('ab_st'))}</th>
      <th>${esc(t('ad_trust'))}</th><th>${esc(t('ad_projCount'))}</th>
      <th>${esc(t('ad_created'))}</th><th></th>
    </tr></thead>
    <tbody>${list.map(userRow).join('')}</tbody>
  </table></div>` : `<div class="empty">${esc(t('ad_noUsers'))}</div>`}`;
}

function userRow(u) {
  const meta = ROLE_META[u.role] || ROLE_META.author;
  const isMe = u.id === S.me.id;
  return `
  <tr>
    <td>
      <b>${esc(u.fullName)}</b>${isMe ? ` <span class="muted">(${esc(t('g_you'))})</span>` : ''}
      <div class="rowsub mono">${esc(u.email)}</div>
      ${u.company ? `<div class="rowsub">${esc(u.company)}</div>` : ''}
      ${u.note ? `<div class="rowsub" style="color:var(--maker)">📝 ${esc(u.note)}</div>` : ''}
    </td>
    <td><span class="badge" style="background:${meta.color}1f;color:${meta.color}">${meta.emoji} ${esc(rl(u.role))}</span></td>
    <td>${userBadge(u.status)}</td>
    <td>${trustBar(u.trust)}</td>
    <td>${u.projectCount}</td>
    <td class="muted">${fdate(u.createdAt)}</td>
    <td><div class="acts">
      ${u.status === 'pending' ? `
        <button class="btn btn-ok btn-sm" onclick="setUserStatus(${u.id},'active')">${esc(t('ad_approve'))}</button>
        <button class="btn btn-ghost btn-sm" onclick="setUserStatus(${u.id},'rejected')">${esc(t('ad_reject'))}</button>` : ''}
      ${u.status === 'active' && !isMe && u.role !== 'admin' ? `
        <button class="btn btn-ghost btn-sm" onclick="setUserStatus(${u.id},'blocked')">${esc(t('ad_block'))}</button>` : ''}
      ${u.status === 'blocked' || u.status === 'rejected' ? `
        <button class="btn btn-ok btn-sm" onclick="setUserStatus(${u.id},'active')">${esc(t('ad_unblock'))}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="editUser(${u.id})">${esc(t('ad_edit'))}</button>
      ${!isMe && u.role !== 'admin' ? `
        <button class="btn btn-danger btn-sm" onclick="askDeleteUser(${u.id})">${esc(t('ad_delete'))}</button>` : ''}
    </div></td>
  </tr>`;
}

async function setUserStatus(id, status) {
  try {
    await API.post(`/admin/users/${id}/status`, { status });
    toast(t('ad_saved'));
    await reloadAdmin();
  } catch (err) { toastErr(err); }
}

function askDeleteUser(id) {
  confirmBox(t('ad_confirmDel'), async () => {
    await API.del('/admin/users/' + id);
    toast(t('g_deleted'));
    closeModal();
    await reloadAdmin();
  });
}

/* Düzəliş pəncərəsi — rol, trust, qeyd və parol sıfırlaması bir yerdə. */
async function editUser(id) {
  const list = await API.get('/admin/users?status=all&role=all');
  const u = list.find((x) => x.id === id);
  if (!u) return toast(t('e_notFound'), false);
  const roles = ['author', 'maker', 'investor', 'seller', 'admin'];

  openModal(`
    <h3>${esc(u.fullName)}</h3>
    <div class="field"><label>${esc(t('a_name'))}</label><input id="eu_name" value="${esc(u.fullName)}"></div>
    <div class="field"><label>${esc(t('a_company'))}</label><input id="eu_company" value="${esc(u.company)}"></div>
    <div class="field"><label>${esc(t('a_phone'))}</label><input id="eu_phone" value="${esc(u.phone)}"></div>
    <div class="grid g2">
      <div class="field"><label>${esc(t('a_role'))}</label>
        <select id="eu_role">${roles.map((r) =>
          `<option value="${r}" ${u.role === r ? 'selected' : ''}>${esc(rl(r))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('ad_trust'))} (0–100)</label>
        <input id="eu_trust" type="number" min="0" max="100" value="${u.trust}"></div>
    </div>
    <div class="field"><label>${esc(t('ad_note'))}</label>
      <textarea id="eu_note" rows="2">${esc(u.note)}</textarea></div>
    <div class="field"><label>${esc(t('ad_newPass'))}</label>
      <input id="eu_pass" type="password" autocomplete="new-password" placeholder="${esc(t('a_passHint'))}"></div>
    <div class="row">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">${esc(t('ad_cancel'))}</button>
      <button class="btn btn-primary btn-sm" onclick="submitModal()">${esc(t('ad_save'))}</button>
    </div>`, async () => {
    await API.patch('/admin/users/' + id, {
      fullName: val('eu_name'), company: val('eu_company'), phone: val('eu_phone'),
      role: val('eu_role'), trust: numVal('eu_trust'), note: val('eu_note'),
    });
    const pass = val('eu_pass');
    if (pass) await API.post(`/admin/users/${id}/password`, { password: pass });
    toast(t('ad_saved'));
    closeModal();
    await reloadAdmin();
  });
}

/* ============================= LAYİHƏLƏR ============================= */
async function adminProjects() {
  const list = await API.get('/projects');
  if (!list.length) return `<div class="empty">${esc(t('c_empty'))}</div>`;
  return `
  <div class="tablewrap"><table class="tbl">
    <thead><tr>
      <th>${esc(t('n_name'))}</th><th>${esc(t('p_author'))}</th><th>${esc(t('ab_st'))}</th>
      <th>${esc(t('ab_rating'))}</th><th>${esc(t('ab_preorders'))}</th>
      <th>${esc(t('d_i_t3'))}</th><th></th>
    </tr></thead>
    <tbody>${list.map((p) => `
      <tr>
        <td><b>${esc(p.title)}</b><div class="rowsub">${esc(catL(p.category))} · ${fdate(p.createdAt)}</div></td>
        <td>${esc(p.authorName)}</td>
        <td>${badge(p.status)}</td>
        <td>${p.rating || '—'}</td>
        <td>${num(p.demand)}</td>
        <td>${money(p.invested)}</td>
        <td><div class="acts">
          <a class="btn btn-ghost btn-sm" href="#/project/${p.id}">${esc(t('tab_about'))}</a>
          <button class="btn btn-danger btn-sm" onclick="askDeleteProject(${p.id})">${esc(t('ad_delete'))}</button>
        </div></td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

function askDeleteProject(id) {
  confirmBox(t('ad_confirmDelProj'), async () => {
    await API.del('/admin/projects/' + id);
    toast(t('g_deleted'));
    closeModal();
    await reloadAdmin();
  });
}

/* ================================ AUDİT ================================ */
async function adminAudit() {
  const list = await API.get('/admin/audit?limit=300');
  if (!list.length) return `<div class="empty">${esc(t('c_empty'))}</div>`;
  return `
  <div class="tablewrap"><table class="tbl">
    <thead><tr>
      <th>${esc(t('ad_auditWhen'))}</th><th>${esc(t('ad_auditWho'))}</th>
      <th>${esc(t('ad_auditAction'))}</th><th>${esc(t('ad_auditObj'))}</th><th>IP</th>
    </tr></thead>
    <tbody>${list.map((a) => `
      <tr>
        <td class="muted mono">${fdatetime(a.createdAt)}</td>
        <td>${esc(a.actor)}${a.actorRole ? `<div class="rowsub">${esc(rl(a.actorRole))}</div>` : ''}</td>
        <td><span class="mono">${esc(a.action)}</span>
          ${a.meta ? `<div class="rowsub mono">${esc(a.meta)}</div>` : ''}</td>
        <td class="muted mono">${esc(a.entity)}${a.entityId ? ' #' + a.entityId : ''}</td>
        <td class="muted mono">${esc(a.ip)}</td>
      </tr>`).join('')}</tbody>
  </table></div>`;
}

/* ============================= PARAMETRLƏR ============================= */
async function adminSettings() {
  const s = await API.get('/admin/settings');
  const fees = [
    ['fee_production', 'pc_c1'], ['fee_investment', 'pc_c2'], ['fee_sales', 'pc_c3'],
    ['fee_escrow', 'pc_c4'], ['fee_partner', 'pc_c5'],
  ];
  const subs = [
    ['sub_author', 'pc_authorPro'], ['sub_maker', 'role_maker'],
    ['sub_investor', 'role_investor'], ['sub_seller', 'role_seller'],
  ];
  return `
  <div class="grid g2">
    <div class="card"><h3>${esc(t('pc_rev'))} (%)</h3>
      ${fees.map(([k, label]) => `
        <div class="field"><label>${esc(t(label))}</label>
          <input id="set_${k}" type="number" step="0.1" min="0" max="100" value="${esc(s[k])}"></div>`).join('')}
    </div>
    <div class="card"><h3>${esc(t('pc_subs'))} ($)</h3>
      ${subs.map(([k, label]) => `
        <div class="field"><label>${esc(t(label))}</label>
          <input id="set_${k}" type="number" step="1" min="0" value="${esc(s[k])}"></div>`).join('')}
    </div>
  </div>
  <div style="margin-top:14px">
    <button class="btn btn-primary btn-sm" onclick="saveSettings()">${esc(t('ad_save'))}</button>
    <span class="muted" style="font-size:12.5px;margin-left:10px">${esc(t('ad_feeNote'))}</span>
  </div>`;
}

async function saveSettings() {
  const keys = ['fee_production', 'fee_investment', 'fee_sales', 'fee_escrow', 'fee_partner',
    'sub_author', 'sub_maker', 'sub_investor', 'sub_seller'];
  const body = {};
  keys.forEach((k) => { body[k] = val('set_' + k); });
  try {
    await API.post('/admin/settings', body);
    toast(t('ad_saved'));
  } catch (err) { toastErr(err); }
}
