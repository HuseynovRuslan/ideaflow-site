/* ==========================================================================
   Rol baxışı (demo) — yalnız admin üçün. Admin rol seçir və saytın REAL
   ekranları həmin rolun gözü ilə açılır, amma bütün məlumat buradakı nümunədən
   gəlir: demo rejimində serverə heç bir sorğu getmir, real istifadəçinin kimliyi
   götürülmür və heç nə saxlanılmır.

   Ssenari: Pryzma Əmircanın loqotipi ideyasını verib → Laçın tikiş fabriki (Latifa) 500 ədəd
   T-shirt istehsal edib → məhsul hazırdır və satıcıların kataloqunda görünür.
   İnvestor və satıcı hələ heç nə etməyib. Qiymət və royalti təyin edilməyib.
   ========================================================================== */

const DEMO_USERS = {
  author:   { id: 9002, email: 'pryzma@demo',   fullName: 'Pryzma',         role: 'author',   status: 'active', trust: 50, lang: 'az', company: '' },
  maker:    { id: 9003, email: 'latifa@demo',   fullName: 'Latifa',         role: 'maker',    status: 'active', trust: 50, lang: 'az', company: 'Laçın tikiş fabriki' },
  investor: { id: 9004, email: 'investor@demo', fullName: 'Demo investor',  role: 'investor', status: 'active', trust: 50, lang: 'az', company: '' },
  seller:   { id: 9005, email: 'seller@demo',   fullName: 'Demo satıcı',    role: 'seller',   status: 'active', trust: 50, lang: 'az', company: '' },
};

const Demo = (() => {
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const [AUTHOR, MAKER] = [9002, 9003];

  const PROJECTS = [
    {
      id: 1, title: 'Əmircanın loqotipi — T-shirt', category: 'apparel', status: 'sales',
      rating: 0, price: null, unitCost: null, moq: 500, royalty: 0, market: '',
      demand: 0, interest: 0, invested: 0, stock: 500, aiReport: null,
      makerCompany: 'Laçın tikiş fabriki', makerName: 'Latifa', makerQty: 500,
      descr: 'Pryzma tərəfindən verilmiş ideya: Əmircanın loqotipi ilə T-shirt. Laçın tikiş fabriki (Latifa) 500 ədəd T-shirt istehsal edib — məhsul hazırdır və satıcılar üçün açıqdır.',
      offers: [{
        id: 11, price: null, moq: 500, days: null, status: 'accepted', createdAt: ago(10),
        note: '500 ədəd T-shirt istehsal olunub, hazırdır.',
        makerId: MAKER, makerName: 'Latifa', makerCompany: 'Laçın tikiş fabriki', makerTrust: 50,
      }],
      investments: [], preorders: [], interestList: [], messages: [],
    },
  ].map((p) => ({
    authorId: AUTHOR, authorName: 'Pryzma', authorTrust: 50, createdAt: ago(20),
    risks: [], assessedAt: null, aiLang: 'az', aiAt: null, aiEnabled: true, documents: [],
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
    author: { projects: 1, avgRating: 0, offers: 0, preorders: 0 },
    maker: { requests: 0, myOffers: 0, won: 1, inProduction: 1 },
    investor: { seeking: 0, portfolio: 0, invested: 0, pending: 0 },
    seller: { pipeline: 0, myPreorders: 0, onSale: 1, reserved: 0 },
  };

  const NOTIFS = {
    author: [],
    maker: [{ key: 'n_offerAccepted', projectId: 1, title: 'Əmircanın loqotipi — T-shirt', at: ago(10) }],
    investor: [],
    seller: [{ key: 'n_newProduct', projectId: 1, title: 'Əmircanın loqotipi — T-shirt', at: ago(1) }],
  };

  const DIRECTORY = {
    maker: [{ id: MAKER, name: 'Latifa', company: 'Laçın tikiş fabriki', trust: 50, deals: 1 }],
    investor: [],
    seller: [],
  };

  const SETTINGS = {
    fee_production: '5', fee_investment: '3', fee_sales: '3', fee_escrow: '1', fee_partner: '15',
    sub_author: '29', sub_maker: '99', sub_investor: '199', sub_seller: '99',
  };

  function contract(p) {
    const m = p.offers.find((o) => o.status === 'accepted');
    return {
      project: { id: p.id, title: p.title, category: p.category, price: p.price, unitCost: p.unitCost, moq: p.moq,
        royalty: p.royalty, descr: p.descr, number: `IF-${new Date().getFullYear()}-${String(p.id).padStart(4, '0')}`, dealAt: ago(10), status: p.status },
      author: { name: p.authorName, company: '', email: DEMO_USERS.author.email, phone: '' },
      maker: m ? { party: { name: m.makerName, company: m.makerCompany, email: DEMO_USERS.maker.email, phone: '' },
        price: m.price, moq: m.moq, days: m.days, note: m.note } : null,
      investors: [],
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

  /* İcmalın yuxarısında göstərilən nümunə (real layihə deyil). */
  const example = () => clone(PROJECTS[0]);

  /* Kataloq və layihə səhifəsi üçün nümunə: id «ex», heç bir əməliyyat açıq deyil —
     real API-yə sorğu getməsin deyə bütün «can» bayraqları söndürülür. */
  function exampleDetail() {
    const p = card(PROJECTS[0], { id: -1, role: 'viewer' });
    return clone({
      ...p, id: 'ex', example: true, participant: false,
      can: { edit: false, assess: false, aiAssess: false, offer: false, invest: false, preorder: false, transitions: [], contract: false },
    });
  }

  /* İstehsalçılar siyahısı üçün nümunə istehsalçı. */
  const exampleMaker = () => ({ ...clone(DIRECTORY.maker[0]), example: true });

  return { handle, example, exampleDetail, exampleMaker };
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
