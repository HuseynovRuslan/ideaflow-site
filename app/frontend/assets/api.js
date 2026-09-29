/* ==========================================================================
   Server ilə əlaqə. Bütün cavablar JSON-dur; xəta halında server
   {error:"e_xxx"} qaytarır və bu açar birbaşa lüğətdən tərcümə olunur.
   ========================================================================== */

class ApiError extends Error {
  constructor(key, status) {
    super(key);
    this.key = key;
    this.status = status;
  }
}

const API = {
  async req(path, opts = {}) {
    // Admin rol baxışı (demo): cavablar brauzerdəki nümunələrdən gəlir, serverə
    // heç nə getmir. Çıxış istisnadır — admin həqiqətən çıxa bilsin.
    if (typeof S !== 'undefined' && S.demo && path !== '/auth/logout') return Demo.handle(path, opts);
    let res;
    try {
      res = await fetch('/api' + path, { credentials: 'same-origin', ...opts });
    } catch (_) {
      throw new ApiError('e_network', 0);
    }
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); } catch (_) { data = null; }
    }
    // 429-u həm rate limiter (boş cavab), həm də endpoint-lər öz açarı ilə
    // (məs. e_aiLimit) qaytarır — açar varsa onu göstəririk.
    if (res.status === 429) throw new ApiError((data && data.error) || 'e_429', 429);
    if (!res.ok) throw new ApiError((data && data.error) || 'e_network', res.status);
    return data;
  },

  get(path) { return API.req(path); },

  /* Qeydiyyatsız açıq səhifə üçün (/api/public/...). */
  pub(path) { return API.req('/public' + path); },

  send(path, method, body) {
    return API.req(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  },

  post(path, body) { return API.send(path, 'POST', body); },
  patch(path, body) { return API.send(path, 'PATCH', body); },
  del(path) { return API.req(path, { method: 'DELETE' }); },

  /* Fayl yükləməsi — Content-Type-ı brauzer özü qoyur (boundary ilə). */
  upload(path, formData) {
    return API.req(path, { method: 'POST', body: formData });
  },

  /* --- qısa yollar --- */
  me() { return API.get('/me'); },
  login(email, password) { return API.post('/auth/login', { email, password }); },
  register(payload) { return API.post('/auth/register', payload); },
  logout() { return API.post('/auth/logout', {}); },
};
