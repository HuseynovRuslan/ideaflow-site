/* ==========================================================================
   Layihə kartı — vahid rəqəmsal pasport. Bütün rollar eyni kartla işləyir,
   amma hər rol yalnız özünə aid bölmələri və məlumatı görür.
   ========================================================================== */

async function renderProject(id, token) {
  shell(`<div class="loading">${t('g_loading')}</div>`);
  try {
    // «ex» — Pryzma nümunəsi; serverdə yoxdur, brauzerdəki nümunədən göstərilir.
    const p = id === 'ex' ? Demo.exampleDetail() : await API.get('/projects/' + id);
    if (token !== S.renderToken) return;
    S.project = p;
    const tabs = projectTabs(p);
    if (!tabs.includes(S.tab)) S.tab = 'about';
    setContent(projectHtml());
  } catch (err) {
    if (token !== S.renderToken) return;
    if (err.key === 'e_auth') { S.me = null; return render(); }
    setContent(`<div class="empty">${esc(t(err.key || 'e_notFound'))}</div>`);
  }
  refreshNotifs();
}

/* Kartı yenidən yükləyir (əməliyyatdan sonra). */
async function reloadProject() {
  const p = await API.get('/projects/' + S.project.id);
  S.project = p;
  setContent(projectHtml());
}

function projectTabs(p) {
  const tabs = ['about', 'ai'];
  // Claude tabı: hesabat varsa hamı görür; yoxdursa yalnız onu işə sala bilən.
  if (p.aiReport || (p.can && p.can.assess)) tabs.push('claude');
  tabs.push('fin', 'prod', 'inv');
  if (['deal', 'prod', 'sales'].includes(p.status)) tabs.push('deal');
  if (p.participant) tabs.push('docs', 'chat');
  return tabs;
}

function projectHtml() {
  const p = S.project;
  const [bg, em] = COVERS[p.category] || ['#EEE', '📦'];
  const tabs = projectTabs(p);
  return `
  <a class="back" href="#/projects">← ${esc(t('p_back').replace(/^←\s*/, ''))}</a>
  <section class="phero" style="--cov:${bg}">
    <div class="phic">${em}</div>
    <div class="phtext">
      <div class="phchips">${p.example ? `<span class="jex">${esc(t('j_example'))}</span>` : ''}${badge(p.status)}<span class="chip">${esc(catL(p.category))}</span></div>
      <h1>${esc(p.title)}</h1>
      <p>${esc(t('p_author'))}: <b>${esc(p.authorName)}</b> · ${fdate(p.createdAt)}</p>
    </div>
    <div class="phring">${ring(stageProgress(p.status), 72, p.status === 'sales' ? 'var(--accent-2)' : 'var(--accent)')}</div>
  </section>
  <div class="pstats">
    <div><small>${esc(t('f_price'))}</small><b>${money(p.price)}</b></div>
    <div><small>${esc(t('ab_rating'))}</small><b>${p.rating ? p.rating + '/100' : '—'}</b></div>
    <div><small>${esc(t('ab_preorders'))}</small><b>${num(p.demand)}</b></div>
    <div><small>${esc(p.stock ? t('ab_stock') : t('ab_interest'))}</small><b>${num(p.stock || p.interest)}</b></div>
  </div>
  ${timeline(p.status)}
  ${statusActions(p)}
  <div class="tabs" style="margin-top:18px">
    ${tabs.map((k) => `<button class="${S.tab === k ? 'on' : ''}" onclick="S.tab='${k}';setContent(projectHtml())">
        ${esc(t('tab_' + k))}</button>`).join('')}
  </div>
  ${tabBody(p)}`;
}

/* Mərhələni irəli aparan düymələr — yalnız icazəsi olana göstərilir. */
function statusActions(p) {
  const list = (p.can && p.can.transitions) || [];
  if (!list.length) return '';
  return `<div class="pillrow" style="margin-top:14px;align-items:center">
    <span class="muted" style="font-size:13px">${esc(t('st_moveTo'))}</span>
    ${list.map((to) => `<button class="btn ${to === 'rejected' ? 'btn-danger' : 'btn-ghost'} btn-sm"
      onclick="moveStatus(${p.id},'${to}')">${esc(t('tl_' + to) === 'tl_' + to ? sl(to) : t('tl_' + to))}</button>`).join('')}
  </div>`;
}

async function moveStatus(id, to) {
  try {
    await API.post(`/projects/${id}/status`, { to });
    toast(t('g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

/* ------------------------------------------------------------- bölmələr */
function tabBody(p) {
  switch (S.tab) {
    case 'about': return aboutTab(p);
    case 'ai': return assessTab(p);
    case 'claude': return claudeTab(p);
    case 'fin': return finTab(p);
    case 'prod': return prodTab(p);
    case 'inv': return invTab(p);
    case 'deal': return dealTab(p);
    case 'docs': return docsTab(p);
    case 'chat': return chatTab(p);
    default: return '';
  }
}

function aboutTab(p) {
  return `
  <div class="grid g2">
    <div class="card">
      <h3>${esc(t('ab_about'))}</h3>
      <p class="muted" style="font-size:14px;white-space:pre-wrap;margin-top:6px">${esc(p.descr || '—')}</p>
    </div>
    <div class="card">
      <h3>${esc(t('ab_status'))}</h3>
      <div class="kv"><span>${esc(t('ab_cat'))}</span><b>${esc(catL(p.category))}</b></div>
      <div class="kv"><span>${esc(t('ab_st'))}</span><b>${badge(p.status)}</b></div>
      <div class="kv"><span>${esc(t('ab_rating'))}</span><b>${stars(p.rating)}</b></div>
      <div class="kv"><span>${esc(t('ab_preorders'))}</span><b>${num(p.demand)}</b></div>
      <div class="kv"><span>${esc(t('ab_interest'))}</span><b>${num(p.interest)}</b></div>
      ${p.stock ? `<div class="kv"><span>📦 ${esc(t('ab_stock'))}</span><b style="color:var(--seller)">${num(p.stock)}</b></div>` : ''}
      <div class="kv"><span>${esc(t('ad_trust'))} (${esc(t('p_author'))})</span><b>${trustBar(p.authorTrust)}</b></div>
    </div>
  </div>
  ${isManager(p) ? shareCard(p) : ''}
  ${isManager(p) ? interestCard(p) : ''}
  ${p.can.preorder ? preorderCard(p) : ''}
  ${p.can.edit ? editCard(p) : ''}`;
}

/* Layihəni idarə edən: müəllif və ya admin. */
function isManager(p) { return !p.example && (S.me.role === 'admin' || p.authorId === S.me.id); }

/* Açıq linki paylaşmaq — tələbin platformadan kənar yoxlanışı. */
function shareCard(p) {
  const url = publicUrl(p.id);
  return `
  <div class="card sharecard" style="margin-top:14px">
    <h3>📣 ${esc(t('sh_title'))}</h3>
    <p class="muted" style="font-size:13px;margin:4px 0 12px">${esc(t('sh_sub'))}</p>
    ${p.isPublic ? `
      <div class="sharerow">
        <input id="sh_url" value="${esc(url)}" readonly onclick="this.select()">
        <button class="btn btn-primary btn-sm" onclick="copyShare()">${esc(t('sh_copy'))}</button>
        <a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('sh_open'))}</a>
      </div>
      <div class="pillrow" style="margin-top:10px">
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener"
           href="https://wa.me/?text=${encodeURIComponent(p.title + ' — ' + url)}">WhatsApp</a>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener"
           href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(p.title)}">Telegram</a>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener"
           href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
      </div>` : `<div class="empty" style="padding:12px">${esc(t('sh_notYet'))}</div>`}
  </div>`;
}

async function copyShare() {
  const el = document.getElementById('sh_url');
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
  } catch (_) {
    el.select();
    document.execCommand('copy'); // köhnə brauzerlər / HTTP üçün
  }
  toast(t('sh_copied'));
}

function interestCard(p) {
  const list = p.interestList || [];
  return `
  <div class="card" style="margin-top:14px">
    <h3>🙋 ${esc(t('it_title'))} <span class="muted" style="font-weight:500">(${list.length})</span></h3>
    ${list.length ? `<div class="tablewrap" style="margin-top:8px"><table class="tbl">
      <thead><tr><th>${esc(t('pub_name'))}</th><th>${esc(t('pub_contact'))}</th>
        <th>${esc(t('pre_qty'))}</th><th>${esc(t('ad_created'))}</th></tr></thead>
      <tbody>${list.map((i) => `<tr>
        <td><b>${esc(i.name)}</b>${i.note ? `<div class="rowsub">${esc(i.note)}</div>` : ''}</td>
        <td class="mono">${esc(i.contact)}</td>
        <td>${num(i.qty)}</td>
        <td class="muted">${fdate(i.createdAt)}</td></tr>`).join('')}</tbody>
    </table></div>` : `<div class="empty" style="padding:14px">${esc(t('it_empty'))}</div>`}
  </div>`;
}

function preorderCard(p) {
  const mine = (p.preorders || []).find((r) => r.sellerId === S.me.id);
  return `
  <div class="card" style="margin-top:14px">
    <h3>${esc(t('pre_title'))}</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">${esc(t('d_s_sub'))}</p>
    <div class="grid g2">
      <div class="field"><label>${esc(t('pre_qty'))}</label>
        <input id="pre_qty" type="number" min="1" value="${mine ? mine.qty : 100}"></div>
      <div style="display:flex;align-items:flex-end;gap:8px;padding-bottom:14px">
        <button class="btn btn-primary btn-sm" onclick="savePreorder(${p.id})">${esc(t('pre_save'))}</button>
        ${mine ? `<button class="btn btn-ghost btn-sm" onclick="dropPreorder(${p.id})">${esc(t('pre_drop'))}</button>` : ''}
      </div>
    </div>
  </div>`;
}

async function savePreorder(id) {
  try {
    await API.post(`/projects/${id}/preorder`, { qty: numVal('pre_qty') });
    toast(t('g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

async function dropPreorder(id) {
  try {
    await API.del(`/projects/${id}/preorder`);
    toast(t('g_deleted'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

function editCard(p) {
  return `
  <div class="card" style="margin-top:14px">
    <h3>${esc(t('ad_edit'))}</h3>
    <div class="field"><label>${esc(t('n_name'))}</label><input id="ed_title" value="${esc(p.title)}"></div>
    <div class="field"><label>${esc(t('n_desc'))}</label><textarea id="ed_descr" rows="5">${esc(p.descr)}</textarea></div>
    <div class="grid g2">
      <div class="field"><label>${esc(t('f_price'))}</label>
        <input id="ed_price" type="number" step="0.01" min="0" value="${p.price ?? ''}"></div>
      <div class="field"><label>${esc(t('f_cost'))}</label>
        <input id="ed_cost" type="number" step="0.01" min="0" value="${p.unitCost ?? ''}"></div>
    </div>
    <div class="grid g2">
      <div class="field"><label>${esc(t('f_moq'))}</label>
        <input id="ed_moq" type="number" min="0" value="${p.moq ?? ''}"></div>
      ${S.me.role === 'admin' ? `<div class="field"><label>${esc(t('f_royalty'))} (%)</label>
        <input id="ed_royalty" type="number" min="0" max="50" value="${p.royalty}"></div>`
        : `<div class="field"><label>${esc(t('f_royalty'))}</label>
        <div class="muted" style="padding:11px 0;font-size:14px">${esc(royaltyL(p))} · ${esc(t('roy_adminNote'))}</div></div>`}
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveProject(${p.id})">${esc(t('ad_save'))}</button>
  </div>`;
}

async function saveProject(id) {
  try {
    await API.patch('/projects/' + id, {
      title: val('ed_title'), descr: val('ed_descr'),
      price: numVal('ed_price'), unitCost: numVal('ed_cost'),
      moq: numVal('ed_moq'),
      ...(S.me.role === 'admin' ? { royalty: numVal('ed_royalty') } : {}),
    });
    toast(t('g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

/* ------------------------------------------------------ qiymətləndirmə */
function assessTab(p) {
  if (!p.assessedAt) {
    return `<div class="card">
      <h3>${esc(t('ai_none'))}</h3>
      <p class="muted" style="font-size:14px;margin:6px 0 14px">${esc(t('ai_noneSub'))}</p>
      ${p.can.assess ? `<button class="btn btn-primary btn-sm" onclick="runAssess(${p.id})">${esc(t('as_run'))}</button>`
        : `<div class="empty">${esc(t('ai_none'))}</div>`}
    </div>`;
  }
  const risks = p.risks || [];
  return `
  <div class="grid g2">
    <div class="card">
      <h3>${esc(t('ai_market'))}</h3>
      <div class="kv"><span>${esc(t('ai_size'))}</span><b>${esc(p.market || '—')}</b></div>
      <div class="kv"><span>${esc(t('ai_cost'))}</span><b>${money(p.unitCost)}</b></div>
      <div class="kv"><span>${esc(t('ai_price'))}</span><b>${money(p.price)}</b></div>
      <div class="kv"><span>${esc(t('ai_rating'))}</span><b>${stars(p.rating)}</b></div>
      <p class="muted" style="font-size:12px;margin-top:10px">${esc(t('as_how'))}</p>
      ${p.can.assess ? `<button class="btn btn-ghost btn-sm" style="margin-top:12px"
          onclick="runAssess(${p.id})">${esc(t('as_again'))}</button>` : ''}
    </div>
    <div class="card">
      <h3>${esc(t('ai_risks'))}</h3>
      ${risks.length ? risks.map((k) => `<div class="risk">${esc(t(k))}</div>`).join('')
        : `<div class="empty">${esc(t('g_none'))}</div>`}
    </div>
  </div>`;
}

async function runAssess(id) {
  try {
    const res = await API.post(`/projects/${id}/assess`, {});
    const brk = res.breakdown || {};
    toast(t('as_done') + res.rating);
    await reloadProject();
    // Balın haradan gəldiyi dərhal göstərilir — qara qutu təəssüratı qalmasın.
    const el = document.querySelector('.card');
    if (el) {
      const chips = ['margin', 'demand', 'descr', 'category']
        .map((k) => `<span>${esc(t('as_' + k))}: ${brk[k] ?? 0}</span>`).join('');
      el.insertAdjacentHTML('beforeend', `<div class="brk">${chips}</div>`);
    }
  } catch (err) { toastErr(err); }
}

/* ------------------------------------------------- Claude ilə təhlil */
let aiBusy = false;

function claudeTab(p) {
  const r = p.aiReport;
  const canRun = p.can.aiAssess;
  const runBtn = (label) => canRun
    ? `<button class="btn btn-primary btn-sm" id="aibtn" onclick="runClaude(${p.id})" ${aiBusy ? 'disabled' : ''}>✨ ${esc(t(label))}</button>`
    : '';
  const busy = `<div class="aibusy" id="aibusy" ${aiBusy ? '' : 'hidden'}><span class="spin"></span>${esc(t('ai2_running'))}</div>`;

  if (!r) {
    return `<div class="card">
      <h3>✨ ${esc(t('ai2_title'))}</h3>
      <p class="muted" style="font-size:14px;margin:6px 0 14px">${esc(t('ai2_sub'))}</p>
      ${canRun ? runBtn('ai2_run') + busy
        : `<div class="empty">${esc(t(p.aiEnabled ? 'ai2_noneOther' : 'e_aiOff'))}</div>`}
    </div>`;
  }

  const verdictColor = { go: 'var(--seller)', refine: 'var(--maker)', stop: 'var(--admin)' }[r.verdict] || 'var(--muted)';
  const score = Math.max(0, Math.min(100, Number(r.score) || 0));
  const list = (items) => (items || []).length
    ? `<ul class="ailist">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : `<div class="empty">${esc(t('g_none'))}</div>`;

  return `
  <div class="card aihead">
    <div class="aiverdict" style="--c:${verdictColor}">
      <div class="aiscore"><b>${score}</b><span>/100</span></div>
      <div>
        <div class="muted" style="font-size:12px">${esc(t('ai2_verdict'))}</div>
        <div class="aiv">${esc(t('v_' + r.verdict))}</div>
        <div class="muted" style="font-size:12px;margin-top:2px">
          ${esc(t('ai2_formula'))}: ${p.rating || '—'} · ${esc(t('ai2_at'))}: ${fdatetime(p.aiAt)}
        </div>
      </div>
    </div>
    <p style="margin-top:12px;font-size:14.5px;line-height:1.55">${esc(r.summary)}</p>
    ${canRun ? `<div style="margin-top:12px">${runBtn('ai2_again')}</div>${busy}` : ''}
  </div>

  <div class="grid g2" style="margin-top:14px">
    <div class="card">
      <h3>${esc(t('ai2_market'))}</h3>
      <div class="kv"><span>${esc(t('ai2_size'))}</span><b>${esc(r.market?.size || '—')}</b></div>
      <div class="kv"><span>${esc(t('ai2_trend'))}</span><b>${esc(r.market?.trend || '—')}</b></div>
      ${r.market?.notes ? `<p class="muted" style="font-size:13px;margin-top:8px">${esc(r.market.notes)}</p>` : ''}
      <h3 style="margin-top:16px">${esc(t('ai2_audience'))}</h3>
      <p class="muted" style="font-size:13.5px;margin-top:4px">${esc(r.audience || '—')}</p>
    </div>
    <div class="card">
      <h3>${esc(t('ai2_pricing'))}</h3>
      <p class="muted" style="font-size:13.5px;margin-top:4px">${esc(r.pricing || '—')}</p>
      <h3 style="margin-top:16px">${esc(t('ai2_competitors'))}</h3>
      ${(r.competitors || []).length ? r.competitors.map((c) => `
        <div class="kv" style="align-items:flex-start">
          <span>${esc(c.name)}${c.note ? `<div class="rowsub">${esc(c.note)}</div>` : ''}</span>
          <b style="white-space:nowrap">${esc(c.price)}</b>
        </div>`).join('') : `<div class="empty">${esc(t('g_none'))}</div>`}
    </div>
  </div>

  <div class="card" style="margin-top:14px">
    <h3>${esc(t('ai2_risks'))}</h3>
    ${(r.risks || []).length ? r.risks.map((k) => `
      <div class="airisk sev-${esc(k.severity)}">
        <span class="sev">${esc(t('sev_' + k.severity))}</span>
        <div><b>${esc(k.title)}</b><div class="muted" style="font-size:13px">${esc(k.detail)}</div></div>
      </div>`).join('') : `<div class="empty">${esc(t('g_none'))}</div>`}
  </div>

  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>${esc(t('ai2_improve'))}</h3>${list(r.improvements)}</div>
    <div class="card"><h3>${esc(t('ai2_next'))}</h3>${list(r.nextSteps)}</div>
  </div>

  ${(r.sources || []).length ? `
  <div class="card" style="margin-top:14px">
    <h3>${esc(t('ai2_sources'))}</h3>
    <ul class="ailist aisrc">${r.sources.filter((s) => /^https?:\/\//i.test(s.url || '')).map((s) => `
      <li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.title || s.url)}</a></li>`).join('')}</ul>
  </div>` : ''}`;
}

async function runClaude(id) {
  if (aiBusy) return;
  aiBusy = true;
  const btn = document.getElementById('aibtn');
  const box = document.getElementById('aibusy');
  if (btn) btn.disabled = true;
  if (box) box.hidden = false;
  try {
    await API.post(`/projects/${id}/ai-assess`, {});
    aiBusy = false;
    toast(t('g_saved'));
    if (S.project && S.project.id === id) await reloadProject();
  } catch (err) {
    aiBusy = false;
    if (btn) btn.disabled = false;
    if (box) box.hidden = true;
    toastErr(err);
  }
}

/* ------------------------------------------------------- maliyyə modeli */
function finTab(p) {
  const price = Number(p.price || 0), cost = Number(p.unitCost || 0);
  const margin = price > 0 && cost > 0 ? Math.round((price - cost) / price * 100) : null;
  return `
  <div class="grid g2">
    <div class="card">
      <h3>${esc(t('f_title'))}</h3>
      <div class="kv"><span>${esc(t('f_cost'))}</span><b>${money(p.unitCost)}</b></div>
      <div class="kv"><span>${esc(t('f_price'))}</span><b>${money(p.price)}</b></div>
      <div class="kv"><span>${esc(t('f_moq'))}</span><b>${p.moq ? num(p.moq) : '—'}</b></div>
      <div class="kv"><span>${esc(t('f_royalty'))}</span><b>${esc(royaltyL(p))}</b></div>
      <div class="kv"><span>${esc(t('as_margin'))}</span><b>${margin === null ? '—' : margin + '%'}</b></div>
    </div>
    <div class="card">
      <h3>${esc(t('f_split'))}</h3>
      <div class="bar">
        <div class="seg" style="background:var(--platform);width:5%">5%</div>
        ${p.royalty > 0 ? `<div class="seg" style="background:var(--author);width:${p.royalty}%">${p.royalty}%</div>` : ''}
        <div class="seg" style="background:var(--investor);width:26%">26%</div>
        <div class="seg" style="background:var(--seller);width:${Math.max(10, 69 - p.royalty)}%">${esc(t('f_rest'))}</div>
      </div>
      <p class="muted" style="font-size:12.5px">${esc(t('f_note'))}</p>
      <div class="kv" style="margin-top:10px"><span>${esc(t('ab_preorders'))}</span><b>${num(p.demand)}</b></div>
      <div class="kv"><span>${esc(t('d_i_t3'))}</span><b>${money(p.invested)}</b></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------- istehsal */
function prodTab(p) {
  const offers = p.offers || [];
  const canAct = S.me.role === 'admin' || p.authorId === S.me.id;
  return `
  ${p.can.offer ? `
  <div class="card" style="margin-bottom:14px">
    <h3>${esc(t('o_sendOffer'))}</h3>
    <div class="grid g3">
      <div class="field"><label>${esc(t('o_price'))}</label><input id="of_price" type="number" step="0.01" min="0"></div>
      <div class="field"><label>${esc(t('o_moq'))}</label><input id="of_moq" type="number" min="1"></div>
      <div class="field"><label>${esc(t('o_days'))}</label><input id="of_days" type="number" min="1"></div>
    </div>
    <div class="field"><label>${esc(t('o_note'))}</label><input id="of_note"></div>
    <button class="btn btn-primary btn-sm" onclick="sendOffer(${p.id})">${esc(t('o_sendOffer'))}</button>
  </div>` : ''}
  <div class="card">
    <h3>${esc(t('pr_offers'))}</h3>
    ${offers.length ? offers.map((o) => `
      <div class="offer">
        <div style="flex:1">
          <b>${esc(o.makerCompany || o.makerName)}</b>
          <span class="muted" style="font-size:12px"> · 🛡 ${o.makerTrust}</span>
          <div class="muted" style="font-size:12.5px">
            ${esc(t('pr_price'))} ${money(o.price)} · MOQ ${num(o.moq)}${o.days ? ` · ${o.days} ${esc(t('pr_days'))}` : ''}
            · ${esc(t('o_st_' + o.status))}
          </div>
          ${o.note ? `<div class="rowsub">${esc(o.note)}</div>` : ''}
        </div>
        <div class="acts">
          ${canAct && o.status === 'pending' && p.status === 'findmaker' ? `
            <button class="btn btn-ok btn-sm" onclick="offerAction(${o.id},'accept')">${esc(t('o_accept'))}</button>
            <button class="btn btn-ghost btn-sm" onclick="offerAction(${o.id},'reject')">${esc(t('o_reject'))}</button>` : ''}
          ${!canAct && o.makerId === S.me.id && o.status === 'pending' ? `
            <button class="btn btn-ghost btn-sm" onclick="offerAction(${o.id},'withdraw')">${esc(t('o_withdraw'))}</button>` : ''}
        </div>
      </div>`).join('') : `<div class="empty">${esc(t('pr_empty'))}</div>`}
  </div>`;
}

async function sendOffer(id) {
  try {
    await API.post(`/projects/${id}/offers`, {
      price: numVal('of_price'), moq: numVal('of_moq'),
      days: numVal('of_days'), note: val('of_note'),
    });
    toast(t('ts_offer'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

async function offerAction(id, action) {
  try {
    await API.post(`/offers/${id}/${action}`, {});
    toast(t(action === 'accept' ? 'ts_accept' : 'g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

/* -------------------------------------------------------- investisiya */
function invTab(p) {
  const list = p.investments || [];
  const canAct = S.me.role === 'admin' || p.authorId === S.me.id;
  return `
  ${p.can.invest ? `
  <div class="card" style="margin-bottom:14px">
    <h3>${esc(t('iv_send'))}</h3>
    <div class="grid g2">
      <div class="field"><label>${esc(t('iv_amount'))}</label><input id="in_amt" type="number" step="0.01" min="0"></div>
      <div class="field"><label>${esc(t('iv_kind'))}</label>
        <select id="in_kind">
          <option value="share">${esc(t('iv_share'))}</option>
          <option value="loan">${esc(t('iv_loan'))}</option>
          <option value="royalty">${esc(t('iv_royalty'))}</option>
        </select></div>
    </div>
    <div class="field"><label>${esc(t('o_note'))}</label><input id="in_note"></div>
    <button class="btn btn-primary btn-sm" onclick="sendInvest(${p.id})">${esc(t('iv_send'))}</button>
  </div>` : ''}
  <div class="card">
    <h3>${esc(t('tab_inv'))}</h3>
    ${list.length ? list.map((i) => `
      <div class="offer">
        <div style="flex:1">
          <b>${esc(i.investorCompany || i.investorName)}</b>
          <span class="muted" style="font-size:12px"> · 🛡 ${i.investorTrust}</span>
          <div class="muted" style="font-size:12.5px">
            ${money(i.amount)} · ${esc(t('iv_' + i.kind))} · ${esc(t('o_st_' + i.status))}
          </div>
          ${i.note ? `<div class="rowsub">${esc(i.note)}</div>` : ''}
        </div>
        <div class="acts">
          ${canAct && i.status === 'pending' && p.status === 'findinv' ? `
            <button class="btn btn-ok btn-sm" onclick="investAction(${i.id},'accept')">${esc(t('o_accept'))}</button>` : ''}
          ${canAct && i.status === 'pending' ? `
            <button class="btn btn-ghost btn-sm" onclick="investAction(${i.id},'reject')">${esc(t('o_reject'))}</button>` : ''}
          ${!canAct && i.investorId === S.me.id && i.status === 'pending' ? `
            <button class="btn btn-ghost btn-sm" onclick="investAction(${i.id},'withdraw')">${esc(t('o_withdraw'))}</button>` : ''}
        </div>
      </div>`).join('') : `<div class="empty">${esc(t('iv_empty'))}</div>`}
  </div>`;
}

async function sendInvest(id) {
  try {
    await API.post(`/projects/${id}/investments`, {
      amount: numVal('in_amt'), kind: val('in_kind'), note: val('in_note'),
    });
    toast(t('ts_invest'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

async function investAction(id, action) {
  try {
    await API.post(`/investments/${id}/${action}`, {});
    toast(t(action === 'accept' ? 'ts_signed' : 'g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

/* ------------------------------------------------------- sövdələşmə */
function dealTab(p) {
  const maker = (p.offers || []).find((o) => o.status === 'accepted');
  const inv = (p.investments || []).filter((i) => i.status === 'accepted');
  return `
  <div class="grid g2">
    <div class="card">
      <h3>${esc(t('dl_parties'))}</h3>
      <div class="kv"><span>${esc(rl('author'))}</span><b>${esc(p.authorName)}</b></div>
      <div class="kv"><span>${esc(rl('maker'))}</span><b>${maker ? esc(maker.makerCompany || maker.makerName) : '—'}</b></div>
      <div class="kv"><span>${esc(rl('investor'))}</span>
        <b>${inv.length ? esc(inv.map((i) => i.investorCompany || i.investorName).join(', ')) : '—'}</b></div>
    </div>
    <div class="card">
      <h3>${esc(t('dl_terms'))}</h3>
      <div class="kv"><span>${esc(t('f_price'))}</span><b>${money(p.price)}</b></div>
      <div class="kv"><span>${esc(t('pr_price'))}</span><b>${maker ? money(maker.price) : '—'}</b></div>
      <div class="kv"><span>${esc(t('f_moq'))}</span><b>${maker ? num(maker.moq) : (p.moq ? num(p.moq) : '—')}</b></div>
      <div class="kv"><span>${esc(t('d_i_t3'))}</span><b>${money(p.invested)}</b></div>
      <div class="kv"><span>${esc(t('f_royalty'))}</span><b>${esc(royaltyL(p))}</b></div>
    </div>
  </div>
  ${p.can.contract ? `<div style="margin-top:14px">
    <a class="btn btn-primary btn-sm" href="#/contract/${p.id}">${esc(t('ct_btn'))}</a>
  </div>` : ''}`;
}

/* ---------------------------------------------------------- sənədlər */
function docsTab(p) {
  const docs = p.documents || [];
  const kinds = ['nda', 'patent', 'contract', 'cert', 'other'];
  return `
  <div class="card">
    <h3>${esc(t('dc_title'))}</h3>
    <p class="muted" style="font-size:12.5px;margin-bottom:12px">${esc(t('dc_private'))}</p>
    ${docs.length ? docs.map((d) => `
      <div class="doc">
        <span class="dt" style="background:${DOCTYPES[d.kind] || '#888'}">${esc(t('dt_' + d.kind))}</span>
        <span class="nm">${esc(d.name)}<div class="rowsub">${esc(d.by)} · ${fdate(d.createdAt)} · ${fsize(d.size)}</div></span>
        <a class="btn btn-ghost btn-sm" href="/api/documents/${d.id}/download">${esc(t('dc_down'))}</a>
        <button class="btn btn-ghost btn-sm" onclick="deleteDoc(${d.id})">${esc(t('dc_del'))}</button>
      </div>`).join('') : `<div class="empty">${esc(t('dc_none'))}</div>`}
  </div>
  <div class="card" style="margin-top:14px">
    <h3>${esc(t('dc_upload'))}</h3>
    <div class="grid g2">
      <div class="field"><label>${esc(t('dc_kind'))}</label>
        <select id="dc_kind">${kinds.map((k) => `<option value="${k}">${esc(t('dt_' + k))}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label>
        <input id="dc_file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip,.txt"></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin-bottom:10px">${esc(t('dc_drop'))}</p>
    <button class="btn btn-primary btn-sm" onclick="uploadDoc(${p.id})">${esc(t('dc_upload'))}</button>
  </div>`;
}

async function uploadDoc(id) {
  const input = document.getElementById('dc_file');
  if (!input || !input.files.length) return toast(t('e_noFile'), false);
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('kind', val('dc_kind'));
  try {
    await API.upload(`/projects/${id}/documents`, fd);
    toast(t('g_saved'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

async function deleteDoc(id) {
  try {
    await API.del('/documents/' + id);
    toast(t('g_deleted'));
    await reloadProject();
  } catch (err) { toastErr(err); }
}

/* ------------------------------------------------------------ söhbət */
function chatTab(p) {
  const ms = p.messages || [];
  return `
  <div class="card">
    <h3>${esc(t('ch_title'))}</h3>
    <p class="muted" style="font-size:12.5px;margin-bottom:12px">${esc(t('dc_private'))}</p>
    <div class="chatbox" id="chatbox">
      ${ms.length ? ms.map((m) => `
        <div class="msg ${m.userId === S.me.id ? 'me' : 'them'}">
          <div class="who">${esc(m.userId === S.me.id ? t('g_you') : m.userName + ' · ' + rl(m.role))}</div>
          ${esc(m.body)}
        </div>`).join('') : `<div class="empty">${esc(t('cm_curator'))}</div>`}
    </div>
    <div class="chatin">
      <input id="msgin" placeholder="${esc(t('ch_ph'))}"
             onkeydown="if(event.key==='Enter')sendMsg(${p.id})">
      <button class="btn btn-primary btn-sm" onclick="sendMsg(${p.id})">${esc(t('ch_send'))}</button>
    </div>
  </div>`;
}

async function sendMsg(id) {
  const el = document.getElementById('msgin');
  const text = (el.value || '').trim();
  if (!text) return;
  el.value = '';
  try {
    await API.post(`/projects/${id}/messages`, { body: text });
    await reloadProject();
    const box = document.getElementById('chatbox');
    if (box) box.scrollTop = box.scrollHeight;
  } catch (err) { toastErr(err); }
}
