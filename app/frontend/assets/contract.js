/* ==========================================================================
   Sövdələşmə müqaviləsinin layihəsi — #/contract/{id}.
   Server tərəfləri və razılaşdırılmış şərtləri verir; burada çapa hazır sənəd
   qurulur. PDF brauzerin «Çap et → PDF kimi saxla» funksiyası ilə alınır —
   beləcə Azərbaycan hərfləri (ə, ş, ğ) heç bir şrift problemi olmadan çıxır.
   ========================================================================== */

async function renderContract(id, token) {
  $('#app').innerHTML = `<div class="loading">${t('g_loading')}</div>`;
  let d;
  try {
    d = await API.get(`/projects/${id}/contract`);
  } catch (err) {
    if (token !== S.renderToken) return;
    if (err.key === 'e_auth') { S.me = null; return render(); }
    $('#app').innerHTML = `<div class="ctbar"><a class="btn btn-ghost btn-sm" href="#/project/${id}">${esc(t('ct_back'))}</a></div>
      <div class="empty">${esc(t(err.key || 'e_network'))}</div>`;
    return;
  }
  if (token !== S.renderToken) return;
  document.title = d.project.number + ' — ' + d.project.title;
  $('#app').innerHTML = `${demoBanner()}
    <div class="ctbar">
      <a class="btn btn-ghost btn-sm" href="#/project/${id}">${esc(t('ct_back'))}</a>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="cycleLang()">${S.lang.toUpperCase()}</button>
      <button class="btn btn-primary btn-sm" onclick="window.print()">🖨 ${esc(t('ct_print'))}</button>
    </div>
    ${contractHtml(d)}`;
}

function contractHtml(d) {
  const p = d.project;
  const m = d.maker;
  const inv = d.investors || [];
  const total = inv.reduce((s, i) => s + Number(i.amount || 0), 0);
  const kv = (k, v) => `<tr><td>${esc(k)}</td><td><b>${v}</b></td></tr>`;

  const party = (role, x, extra = '') => `
    <div class="ctparty">
      <div class="ctrole">${esc(role)}</div>
      <div class="ctname">${esc(x.company || x.name)}</div>
      ${x.company ? `<div>${esc(x.name)}</div>` : ''}
      <div class="ctmuted">${esc(x.email)}${x.phone ? ' · ' + esc(x.phone) : ''}</div>
      ${extra}
    </div>`;

  const signers = [[t('ct_author'), d.author]];
  if (m) signers.push([t('ct_maker'), m.party]);
  inv.forEach((i) => signers.push([t('ct_investor'), i.party]));

  return `
  <article class="contract">
    <div class="ctwarn">⚠️ ${esc(t('ct_draft'))}</div>
    <header>
      <div class="ctbrand"><span class="m">${logoSvg()}</span>IdeaFlow</div>
      <h1>${esc(t('ct_title'))}</h1>
      <div class="ctmeta">${esc(t('ct_no'))} <b>${esc(p.number)}</b> · ${esc(t('ct_date'))}: <b>${fdate(d.generatedAt)}</b></div>
    </header>

    <h2>${esc(t('ct_parties'))}</h2>
    <div class="ctparties">
      ${party(t('ct_author'), d.author)}
      ${m ? party(t('ct_maker'), m.party) : ''}
      ${inv.map((i) => party(t('ct_investor'), i.party)).join('')}
      ${party(t('ct_platform'), { company: 'IdeaFlow', name: '', email: 'ideaflow.qrlog.az', phone: '' })}
    </div>

    <h2>${esc(t('ct_s1'))}</h2>
    <p>${esc(tf('ct_s1t', { title: p.title, cat: catL(p.category), id: p.id }))}</p>

    <h2>${esc(t('ct_s2'))}</h2>
    ${m ? `
      <table class="cttbl">
        ${kv(t('ct_unitPrice'), money(m.price))}
        ${kv(t('ct_moq'), num(m.moq))}
        ${kv(t('ct_lead'), m.days + ' ' + esc(t('ct_days')))}
      </table>
      ${m.note ? `<p class="ctmuted">${esc(m.note)}</p>` : ''}
      <p>${esc(t('ct_s2t'))}</p>` : `<p class="ctmuted">${esc(t('ct_noMaker'))}</p>`}

    <h2>${esc(t('ct_s3'))}</h2>
    ${inv.length ? `
      <table class="cttbl">
        ${inv.map((i) => kv(i.party.company || i.party.name,
          `${money(i.amount)} · ${esc(t('iv_' + i.kind))}`)).join('')}
        ${inv.length > 1 ? kv(t('ct_total'), money(total)) : ''}
      </table>` : `<p class="ctmuted">${esc(t('ct_noInv'))}</p>`}

    <h2>${esc(t('ct_s4'))}</h2>
    <table class="cttbl">
      ${kv(t('ct_retail'), money(p.price))}
      ${kv(t('ct_royalty'), p.royalty + '%')}
    </table>
    <p>${esc(t('ct_s4t'))}</p>

    <h2>${esc(t('ct_s5'))}</h2>
    <p>${esc(t('ct_s5t'))}</p>

    <h2>${esc(t('ct_s6'))}</h2>
    <table class="cttbl">
      ${kv(t('pc_c1'), esc(d.fees.production) + '%')}
      ${kv(t('pc_c2'), esc(d.fees.investment) + '%')}
      ${kv(t('pc_c3'), esc(d.fees.sales) + '%')}
      ${kv(t('pc_c4'), esc(d.fees.escrow) + '%')}
    </table>

    <h2>${esc(t('ct_s7'))}</h2>
    <p>${esc(t('ct_s7t'))}</p>

    <h2>${esc(t('ct_sign'))}</h2>
    <div class="ctsigns">
      ${signers.map(([role, x]) => `
        <div class="ctsign">
          <div class="ctrole">${esc(role)}</div>
          <div class="ctname">${esc(x.company || x.name)}</div>
          ${x.company ? `<div class="ctmuted">${esc(x.name)}</div>` : ''}
          <div class="ctline"></div>
          <div class="ctmuted">${esc(t('ct_signLine'))}</div>
        </div>`).join('')}
    </div>
  </article>`;
}
