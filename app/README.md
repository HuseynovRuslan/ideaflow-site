# IdeaFlow — tətbiq

Bu qovluqda **işlək platforma** var: backend, verilənlər bazası, qeydiyyat, rol sistemi
və admin paneli. `site/` qovluğundakı tək-fayllı maket bunun prototipi idi — saxta data,
serversiz, klikləmək üçün.

| | `site/` (maket) | `app/` (bu qovluq) |
|---|---|---|
| Data | JS-də sabit massiv | PostgreSQL |
| Giriş | rol dropdown-dan seçilir | e-poçt + parol, sessiya |
| Rollar | görüntü üçün | icazə qaydaları serverdə |
| Admin | yoxdur | istifadəçi təsdiqi, audit, hesabatlar |
| Yayım | fayl kopyalanır | build olunur, konteynerdə işləyir |

---

## Vacib: yayım modeli dəyişir

`deploy/deploy.sh` statik sayt üçündür — *«nothing is built, no container is started»*.
Bu tətbiq üçün o boru xətti kifayət etmir: build lazımdır, baza lazımdır.

**Amma təhlükəsizlik modeli dəyişmir.** `app/deploy/deploy.sh` eyni qaydanı saxlayır:

- Skript `deploy` istifadəçisinə məxsusdur, Çingiz üçün yazıla bilməz.
- Çingiz eyni bir sudoers sətri ilə yalnız o faylı işə salır.
- **Çingizə `docker` qrupu verilmir.** `deploy` onsuz da həmin qrupdadır
  (`docker:x:988:deploy`), ona görə konteyneri qaldırmaq üçün yeni icazə lazım deyil.
- Sirlər anbarda yox, serverdəki `.env` faylındadır.

Çingizin gündəlik əmrləri eyni qalır: `check`, `deploy`, `rollback`.

### Sahibin bir dəfəlik işi

```bash
# 1) Skripti quraşdır (statik variantdakı (b) addımının eynisi)
sudo install -o deploy -g deploy -m 755 /opt/ideaflow/app/deploy/deploy.sh /opt/ideaflow/deploy.sh

# 2) .env — yalnız serverdə yaşayır, anbara düşmür
sudo -u deploy tee /opt/ideaflow/app/.env >/dev/null <<'ENV'
POSTGRES_PASSWORD=<uzun təsadüfi>
ADMIN_EMAIL=<admin e-poçtu>
ADMIN_PASSWORD=<güclü parol>
ENV
sudo chmod 600 /opt/ideaflow/app/.env
```

### Caddy bloku

Statik blok reverse-proxy ilə əvəz olunur — **psklub-dakı pattern-in eynisi**:

```
ideaflow.qrlog.az {
	import security_headers
	reverse_proxy ideaflow-app:8080
}
```

Konteyner adı ilə, port ilə yox: Caddy özü konteynerdədir, ona görə `127.0.0.1:8100`
onun öz içinə baxardı. Xidmət paylaşılan şəbəkəyə `ideaflow-app` adı ilə qoşulur —
bunun üçün override simlinki lazımdır (bir dəfəlik, sahib icra edir):

```bash
sudo -u deploy ln -sfn docker-compose.shared-caddy.yml \
  /opt/ideaflow/app/docker-compose.override.yml
```

`root * /srv/ideaflow` və `/srv/ideaflow:/srv/ideaflow:ro` bind-mount-u artıq lazım deyil.
`127.0.0.1:8100` yalnız serverin içindən yoxlama üçün qalır (`deploy.sh check`).

---

## Texniki tərkib

| Qat | Nə |
|---|---|
| Backend | .NET 10 minimal API (`backend/`) |
| Baza | PostgreSQL 17 |
| Frontend | vanilla HTML/CSS/JS, build addımı yoxdur (`frontend/`) |
| Dillər | AZ / RU / EN — `frontend/assets/i18n.js` |

Frontend-də framework yoxdur: fayllar birbaşa `wwwroot`-a kopyalanır. `assets/` üçün
`Cache-Control: no-cache` qoyulub — yayımlanan JS telefonlarda köhnə qalmasın.

## Rollar

| Rol | Nə edir |
|---|---|
| `author` | Layihə yaradır, qiymətləndirir, təklif və investisiya qəbul edir |
| `maker` | `demand`/`findmaker` mərhələsindəki layihələrə istehsal təklifi verir |
| `investor` | `findmaker`/`findinv` layihələrinə investisiya təklif edir |
| `seller` | Kataloqdakı məhsulları ilkin sifarişlə rezerv edir |
| `admin` | İstifadəçi təsdiqi, layihə nəzarəti, hesabatlar, audit, tariflər |

Qeydiyyat sərbəstdir, aktivləşmə admin təsdiqi ilə: yeni hesab `pending` statusunda
yaranır, istifadəçi daxil ola bilir, amma yalnız gözləmə ekranını görür.

### Görünürlük qaydaları

Marketplace-də etibar buna dayanır:

- Kataloqda hər rol öz mərhələlərini görür; `draft`/`assess` yalnız müəllifə və adminə.
- **Təkliflər**: müəllif və admin hamısını, istehsalçı yalnız özününkünü, qalanlar
  yalnız qəbul ediləni görür — rəqib zavodlar bir-birinin qiymətini oxuya bilmir.
- **İnvestisiyalar**: eyni məntiq investorlar üçün.
- **Sənədlər və söhbət**: yalnız iştirakçılara (müəllif, admin və təklif/investisiya/
  sifariş vermiş tərəflər).

## Mərhələlər

```
draft → assess → demand → findmaker → findinv → deal → prod → sales
                    ↘ rejected (admin) ↙
```

Keçidləri `backend/Core.cs` → `Rules.Transitions` idarə edir. Bəziləri avtomatikdir:
ilk istehsal təklifi gələndə `demand → findmaker`, təklif qəbul ediləndə
`findmaker → findinv`, investisiya qəbul ediləndə `findinv → deal`.

Hər keçid `project_status_log`-a yazılır — huni və «aylar üzrə sövdələşmələr»
hesabatları buradan qurulur (`projects.updated_at` hər redaktədə dəyişir, ona etibar olmaz).

## Qiymətləndirmə

`POST /api/projects/{id}/assess` — **açıq formul**, qara qutu deyil (`backend/Core.cs`):

| Komponent | Maksimum bal |
|---|---|
| Marja `(qiymət − maya) / qiymət` | 45 |
| Təsdiqlənmiş tələb (hər 10 ilkin sifariş = 1 bal) | 25 |
| Təsvirin tamlığı | 15 |
| Kateqoriya trendi | 15 |

Nəticə ilə birlikdə komponentlərin payı da qaytarılır və interfeysdə göstərilir.
Maketdə bu, təsadüfi ədəd idi. Real LLM çağırışı lazım olsa, `Assess.Run`-un imzası
dəyişmədən əvəz edilə bilər.

## Lokal işə salma

```bash
cp .env.example .env     # dəyərləri doldurun
docker compose up -d --build
```

Açılır: <http://localhost:8100>

Yalnız backend (baza ayrıca lazımdır): `cd backend && dotnet run` — frontend
`../frontend`-dən verilir, kopyalamaq lazım deyil.

## Təhlükəsizlik

- Parollar PBKDF2-HMAC-SHA256, 600 000 iterasiya.
- Sessiya — HttpOnly + Secure cookie, bazada saxlanılan token, 30 gün.
  Lokal HTTP testi üçün `IDEAFLOW_INSECURE_COOKIE=1`.
- Bloklanan/rədd edilən istifadəçinin açıq sessiyaları dərhal bağlanır. Rol dəyişəndə də.
- Parol dəyişəndə bütün sessiyalar sıfırlanır, yalnız cari cihaz qalır.
- `POST /api/auth/*` IP üzrə dəqiqədə 12 sorğu ilə məhdudlaşıb.
- Mövcud olmayan e-poçt üçün də parol yoxlaması işlədilir — cavab vaxtına görə
  qeydiyyatdan keçmiş e-poçtları sadalamaq mümkün olmasın.
- Yüklənən fayllar diskdə yalnız GUID adı ilə; orijinal ad bazadadır. 15 MB limit,
  ağ siyahı ilə uzantı yoxlanışı.
- Bütün əhəmiyyətli əməliyyatlar `audit` cədvəlinə düşür (kim, nə, nə vaxt, IP).

## Bilinən məhdudiyyətlər

- E-poçt göndərilmir: təsdiq, bildiriş və parol bərpası e-poçtu yoxdur. İstifadəçi
  statusunu yalnız sistemə girəndə görür; parolu admin sıfırlayır.
- Ödəniş inteqrasiyası yoxdur — komissiyalar və eskrou hesablama modelidir.
- Bildirişlər səhifə yenilənəndə çəkilir (push/WebSocket yoxdur).
- **Backend + baza ucdan-uca canlı yoxlanılmayıb** — lokal Docker əlçatmaz olduğu üçün
  yalnız build, konfiq və frontend yoxlanılıb. İlk deploy-dan sonra tam axın keçirilməlidir.
