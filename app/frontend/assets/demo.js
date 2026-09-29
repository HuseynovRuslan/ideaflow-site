/* ==========================================================================
   Rol baxışı (demo) — yalnız admin üçün. Admin rol seçir və saytın REAL
   ekranları həmin rolun gözü ilə açılır, amma bütün məlumat buradakı nümunələrdən
   gəlir: demo rejimində serverə heç bir sorğu getmir, real istifadəçinin kimliyi
   götürülmür və heç nə saxlanılmır.
   ========================================================================== */

const DEMO_USERS = {
  author:   { id: 9002, email: 'demo-author@ideaflow',   fullName: 'Aysel Məmmədova (demo)', role: 'author',   status: 'active', trust: 62, lang: 'az', company: '' },
  maker:    { id: 9003, email: 'demo-maker@ideaflow',    fullName: 'Rəşad Quliyev (demo)',   role: 'maker',    status: 'active', trust: 80, lang: 'az', company: 'Bakı Plast MMC' },
  investor: { id: 9004, email: 'demo-investor@ideaflow', fullName: 'Elçin Həsənov (demo)',   role: 'investor', status: 'active', trust: 75, lang: 'az', company: 'Caspian Ventures' },
  seller:   { id: 9005, email: 'demo-seller@ideaflow',   fullName: 'Nigar Əliyeva (demo)',   role: 'seller',   status: 'active', trust: 70, lang: 'az', company: 'Smart Home Store' },
};

const Demo = (() => {
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const [AUTHOR, MAKER, INVESTOR, SELLER] = [9002, 9003, 9004, 9005];

  const aiReport = {
    summary: 'Ağıllı su şüşəsi Azərbaycanda yeni seqmentdir: rəqiblər əsasən Türkiyə və Çindən idxal olunur, qiymət $25–60 aralığındadır. Marja sağlamdır, amma sertifikasiya və batareya logistikası əsas risklərdir.',
    verdict: 'refine', score: 64,
    market: { size: '$3–5 mln/il (AZ + Gürcüstan, təxmini)', trend: 'İllik 12–15% artım', notes: 'Fitnes və ofis seqmentində tələb artır.' },
    audience: '22–40 yaş, şəhərli, idmanla məşğul olan və ofisdə işləyən insanlar.',
    competitors: [
      { name: 'HidrateSpark PRO', price: '$59', note: 'Premium, Bluetooth' },
      { name: 'Xiaomi Smart Cup', price: '$22–28', note: 'Ucuz, geniş yayılıb' },
    ],
    pricing: '$39 qiymət və $14 maya ilə marja ~64% — yaxşıdır.',
    risks: [
      { title: 'Qida təhlükəsizliyi sertifikatı', detail: 'BPA-free sertifikatı tələb olunacaq.', severity: 'high' },
      { title: 'Litium batareya daşınması', detail: 'Hava ilə idxalda məhdudiyyətlər.', severity: 'medium' },
    ],
    improvements: ['Tətbiqsiz sadə LED rejimi əlavə edin', 'Korporativ hədiyyə paketi hazırlayın'],
    nextSteps: ['3 rəqibi alıb test edin', 'Açıq linklə 200 nəfər maraq toplayın'],
    sources: [],
  };

  const maker = { makerId: MAKER, makerName: 'Rəşad Quliyev', makerCompany: 'Bakı Plast MMC', makerTrust: 80 };
  const investor = { investorId: INVESTOR, investorName: 'Elçin Həsənov', investorCompany: 'Caspian Ventures', investorTrust: 75 };

  // Nümunə layihələr — hər mərhələdən bir, ki, hər rol öz işini görsün.
  const PROJECTS = [
    {
      id: 1, title: 'Ağıllı su şüşəsi', category: 'gadgets', status: 'demand', rating: 71, price: 39, unitCost: 14, moq: 500, royalty: 8,
      market: '$2.1B', demand: 240, interest: 37, invested: 0, aiReport, aiAt: ago(1),
      descr: 'Gün ərzində nə qədər su içdiyinizi izləyən və LED işıqla xatırladan ağıllı şüşə. Qapaqda sensor var, telefon tətbiqi ilə sinxronlaşır, 3 həftə batareya ömrü.',
      offers: [{ id: 11, price: 13.5, moq: 500, days: 45, note: 'Nümunə 10 günə', status: 'pending', createdAt: ago(2), ...maker }],
      investments: [], preorders: [{ id: 1, qty: 240, createdAt: ago(5), sellerId: SELLER, sellerName: 'Nigar Əliyeva', sellerCompany: 'Smart Home Store' }],
      interestList: [
        { id: 1, name: 'Kamran', contact: '+994 50 123 45 67', qty: 2, note: 'Qara rəng olsa', createdAt: ago(2) },
        { id: 2, name: 'Leyla', contact: 'leyla@mail.az', qty: 1, note: '', createdAt: ago(1) },
      ],
      messages: [{ id: 1, body: 'Salam! Nümunəni nə vaxt görə bilərik?', createdAt: ago(1), userId: MAKER, userName: 'Rəşad Quliyev', role: 'maker' }],
    },
    {
      id: 2, title: 'Portativ günəş şarj cihazı', category: 'electronics', status: 'findinv', rating: 78, price: 45, unitCost: 17, moq: 1000, royalty: 7,
      market: '$4.6B', demand: 420, interest: 64, invested: 0, aiReport: null,
      descr: 'Qatlanan günəş paneli və 20 000 mAh batareya. Səyahət və kənd yerləri üçün.',
      offers: [{ id: 21, price: 16, moq: 1000, days: 60, note: '', status: 'accepted', createdAt: ago(9), ...maker }],
      investments: [{ id: 31, amount: 30000, kind: 'share', note: '15% pay təklif edirəm', status: 'pending', createdAt: ago(1), ...investor }],
      preorders: [], interestList: [], messages: [],
    },
    {
      id: 3, title: 'Qatlanan idman xalçası', category: 'sport', status: 'deal', rating: 74, price: 29, unitCost: 9, moq: 1000, royalty: 8,
      market: '$540M', demand: 600, interest: 12, invested: 25000, aiReport: null,
      descr: 'Çantaya sığan, sürüşməyən və yuyula bilən idman xalçası.',
      offers: [{ id: 41, price: 9, moq: 1000, days: 30, note: 'Nümunə 7 günə', status: 'accepted', createdAt: ago(20), ...maker }],
      investments: [{ id: 51, amount: 25000, kind: 'share', note: '', status: 'accepted', createdAt: ago(15), ...investor }],
      preorders: [{ id: 2, qty: 600, createdAt: ago(18), sellerId: SELLER, sellerName: 'Nigar Əliyeva', sellerCompany: 'Smart Home Store' }],
      interestList: [], messages: [],
    },
    {
      id: 4, title: 'Eko alış-veriş çantası', category: 'eco', status: 'draft', rating: 0, price: 12, unitCost: 4, moq: 2000, royalty: 10,
      market: '', demand: 0, interest: 0, invested: 0, aiReport: null,
      descr: 'Təkrar emal olunmuş plastikdən, qatlanıb açar qabına çevrilən çanta.',
      offers: [], investments: [], preorders: [], interestList: [], messages: [],
    },
  ].map((p) => ({
    authorId: AUTHOR, authorName: 'Aysel Məmmədova', authorTrust: 62, createdAt: ago(30 - p.id * 3),
    risks: p.rating ? ['risk_certification'] : [], assessedAt: p.rating ? ago(10) : null,
    aiLang: 'az', aiAt: null, aiEnabled: true, documents: [],
    offerCount: p.offers.filter((o) => o.status === 'pending').length, ...p,
  }));

  // Serverdəki Rules.VisibleStatuses-in eynisi.
  const VISIBLE = {
    maker: ['demand', 'findmaker'],
    investor: ['findmaker', 'findinv', 'deal', 'prod', 'sales'],
    seller: ['demand', 'findmaker', 'findinv', 'deal', 'prod', 'sales'],
  };

  const me = () => S.me;
  const involved = (p, u) =>
    p.offers.some((o) => o.makerId === u.id) || p.investments.some((i) => i.investorId === u.id) ||
    p.preorders.some((r) => r.sellerId === u.id);
  const visible = (p, u) => p.authorId === u.id || (VISIBLE[u.role] || []).includes(p.status) || involved(p, u);

  // Layihə kartı — serverin görünürlük qaydaları ilə (rəqib təklifləri gizli və s.).
  function card(p, u) {
    const own = p.authorId === u.id;
    const early = ['draft', 'assess', 'demand'].includes(p.status);
    const accepted = (list, key) => list.some((x) => x[key] === u.id && x.status === 'accepted');
    const next = { draft: ['assess'], demand: ['findmaker'], findmaker: ['findinv'], findinv: ['deal'] }[p.status] || [];
    return {
      ...p,
      isPublic: !['draft', 'assess'].includes(p.status),
      participant: own || involved(p, u),
      offers: own ? p.offers : p.offers.filter((o) => (u.role === 'maker' ? o.makerId === u.id : o.status === 'accepted')),
      investments: own ? p.investments : p.investments.filter((i) => (u.role === 'investor' ? i.investorId === u.id : i.status === 'accepted')),
      preorders: own ? p.preorders : p.preorders.filter((r) => r.sellerId === u.id),
      interestList: own ? p.interestList : [],
      aiReport: p.aiReport,
      can: {
        edit: own && early, assess: own && early, aiAssess: own && early,
        offer: u.role === 'maker' && ['demand', 'findmaker'].includes(p.status),
        invest: u.role === 'investor' && ['findmaker', 'findinv'].includes(p.status),
        preorder: u.role === 'seller' && !['draft', 'assess'].includes(p.status),
        transitions: own ? next : [],
        contract: ['deal', 'prod', 'sales'].includes(p.status) &&
          (own || accepted(p.offers, 'makerId') || accepted(p.investments, 'investorId')),
      },
    };
  }

  const TILES = {
    author: { projects: 4, avgRating: 74, offers: 1, preorders: 1260 },
    maker: { requests: 1, myOffers: 1, won: 2, inProduction: 1 },
    investor: { seeking: 1, portfolio: 1, invested: 25000, pending: 1 },
    seller: { pipeline: 3, myPreorders: 840, onSale: 0, reserved: 2 },
  };

  const NOTIFS = {
    author: [
      { key: 'n_newOffer', projectId: 1, title: 'Ağıllı su şüşəsi', at: ago(2) },
      { key: 'n_newInvest', projectId: 2, title: 'Portativ günəş şarj cihazı', at: ago(1) },
    ],
    maker: [
      { key: 'n_offerAccepted', projectId: 3, title: 'Qatlanan idman xalçası', at: ago(20) },
      { key: 'n_newRequest', projectId: 1, title: 'Ağıllı su şüşəsi', at: ago(3) },
    ],
    investor: [
      { key: 'n_investAccepted', projectId: 3, title: 'Qatlanan idman xalçası', at: ago(15) },
      { key: 'n_seekingFunds', projectId: 2, title: 'Portativ günəş şarj cihazı', at: ago(4) },
    ],
    seller: [{ key: 'n_newProduct', projectId: 2, title: 'Portativ günəş şarj cihazı', at: ago(4) }],
  };

  const DIRECTORY = {
    maker: [
      { id: MAKER, name: 'Rəşad Quliyev', company: 'Bakı Plast MMC', trust: 80, deals: 2 },
      { id: 9101, name: 'Səbinə Kərimova', company: 'Gəncə Tekstil', trust: 71, deals: 1 },
    ],
    investor: [{ id: INVESTOR, name: 'Elçin Həsənov', company: 'Caspian Ventures', trust: 75, deals: 1 }],
    seller: [{ id: SELLER, name: 'Nigar Əliyeva', company: 'Smart Home Store', trust: 70, deals: 0 }],
  };

  const SETTINGS = {
    fee_production: '5', fee_investment: '3', fee_sales: '3', fee_escrow: '1', fee_partner: '15',
    sub_author: '29', sub_maker: '99', sub_investor: '199', sub_seller: '99',
  };

  function contract(p) {
    const m = p.offers.find((o) => o.status === 'accepted');
    return {
      project: { id: p.id, title: p.title, category: p.category, price: p.price, unitCost: p.unitCost, moq: p.moq,
        royalty: p.royalty, descr: p.descr, number: `IF-${new Date().getFullYear()}-${String(p.id).padStart(4, '0')}`, dealAt: ago(15), status: p.status },
      author: { name: p.authorName, company: '', email: 'aysel@example.az', phone: '+994 50 111 22 33' },
      maker: m ? { party: { name: m.makerName, company: m.makerCompany, email: 'zavod@example.az', phone: '+994 12 444 55 66' },
        price: m.price, moq: m.moq, days: m.days, note: m.note } : null,
      investors: p.investments.filter((i) => i.status === 'accepted').map((i) => ({
        party: { name: i.investorName, company: i.investorCompany, email: 'invest@example.az', phone: '' },
        amount: i.amount, kind: i.kind, note: i.note })),
      fees: { production: '5', investment: '3', sales: '3', escrow: '1' },
      generatedAt: new Date().toISOString(),
    };
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const notFound = () => { throw new ApiError('e_notFound', 404); };

  /* API.req-in demo əvəzi. GET nümunə qaytarır, qalan hər şey «demo» xətasıdır. */
  async function handle(path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    if (path === '/auth/logout') return { ok: true };
    if (method !== 'GET') throw new ApiError('e_demo', 403);

    const u = me();
    const [route, query] = path.split('?');
    const qs = new URLSearchParams(query || '');
    let m;

    if (route === '/me') return clone(u);
    if (route === '/dashboard') return { role: u.role, trust: u.trust, tiles: TILES[u.role] || {} };
    if (route === '/notifications') return clone(NOTIFS[u.role] || []);
    if (route === '/settings/public') return clone(SETTINGS);
    if ((m = route.match(/^\/directory\/(\w+)$/))) return clone(DIRECTORY[m[1]] || []);
    if (route === '/projects') {
      const cat = qs.get('cat'), q = (qs.get('q') || '').toLowerCase();
      return clone(PROJECTS.filter((p) => visible(p, u))
        .filter((p) => qs.get('mine') !== '1' || p.authorId === u.id)
        .filter((p) => !cat || cat === 'all' || p.category === cat)
        .filter((p) => !q || p.title.toLowerCase().includes(q))
        .map((p) => card(p, u)));
    }
    if ((m = route.match(/^\/projects\/(\d+)$/))) {
      const p = PROJECTS.find((x) => x.id === Number(m[1]));
      if (!p || !visible(p, u)) notFound();
      return clone(card(p, u));
    }
    if ((m = route.match(/^\/projects\/(\d+)\/contract$/))) {
      const p = PROJECTS.find((x) => x.id === Number(m[1]));
      if (!p || !card(p, u).can.contract) throw new ApiError('e_forbidden', 403);
      return clone(contract(p));
    }
    if (route.startsWith('/public/')) notFound();
    throw new ApiError('e_forbidden', 403); // admin endpoint-ləri və s. — demo istifadəçiyə qapalıdır
  }

  return { handle };
})();

/* ------------------------------------------------------------ giriş/çıxış */
function startDemo(role) {
  if (!DEMO_USERS[role] || !(S.realMe || S.me) || (S.realMe || S.me).role !== 'admin') return;
  if (!S.realMe) S.realMe = S.me;
  S.demo = role;
  S.me = { ...DEMO_USERS[role] };
  S.notifs = [];
  S.tab = 'about';
  try { sessionStorage.setItem('if_demo', role); } catch (_) { /* gizli rejim */ }
  if (location.hash === '#/app') render(); else go('#/app');
}

function exitDemo() {
  S.demo = null;
  S.me = S.realMe || S.me;
  S.realMe = null;
  S.notifs = [];
  try { sessionStorage.removeItem('if_demo'); } catch (_) { /* gizli rejim */ }
  go('#/admin/views');
}

/* Səhifə yenilənəndə admin demo rejimində idisə, oraya qayıdır. */
function resumeDemo() {
  let role = null;
  try { role = sessionStorage.getItem('if_demo'); } catch (_) { /* gizli rejim */ }
  if (role && S.me && S.me.role === 'admin' && DEMO_USERS[role]) {
    S.realMe = S.me;
    S.demo = role;
    S.me = { ...DEMO_USERS[role] };
  }
}

function demoBanner() {
  if (!S.demo) return '';
  return `<div class="demobar">
    <span>👁 ${esc(tf('vw_banner', { role: rl(S.demo) }))}</span>
    <button class="btn btn-sm" onclick="exitDemo()">${esc(t('vw_exit'))}</button>
  </div>`;
}
