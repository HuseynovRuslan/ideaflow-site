# IdeaFlow — srv323-də yayım (Çingiz üçün)

Məqsəd: Çingiz saytı özü yayımlaya bilsin, **amma serverdə root olmasın**. Bu qovluqdakı qayda
budget-app, psklub və QRLog-un işlədiyi qaydanın eynisidir.

Niyə belə: `docker` qrupuna əlavə etmək və ya `sudo ALL` vermək praktikada root verməkdir — konteynerlə
bütün disk, o cümlədən `.env` sirləri (JWT, baza parolu, R2, AWS) və ehtiyat nüsxələr oxunur. Bu quruluşda
isə Çingiz **yalnız bir skripti işə sala bilir**, skripti dəyişə bilmir və heç bir sirrə toxunmur.

---

## 1. Bir dəfəlik quraşdırma (serverdə, sahib icra edir)

```bash
# a) Anbar və yayım qovluğu
sudo mkdir -p /opt/ideaflow /srv/ideaflow
sudo chown -R deploy:deploy /opt/ideaflow /srv/ideaflow
sudo -u deploy git clone <GITHUB-ANBAR-URL> /opt/ideaflow

# b) Skript — deploy-a məxsus, Çingiz üçün YAZILA BİLMƏZ
sudo install -o deploy -g deploy -m 755 /opt/ideaflow/deploy/vps/deploy.sh /opt/ideaflow/deploy.sh

# c) Çingizə yalnız bu skript üçün icazə
sudo tee /etc/sudoers.d/cingiz-ideaflow >/dev/null <<'EOF'
# cingiz — yalnız IdeaFlow yayımı. Sirlərə, docker-ə və /opt-un qalanına çıxışı yoxdur.
cingiz ALL=(deploy) NOPASSWD: /opt/ideaflow/deploy.sh, /usr/bin/bash /opt/ideaflow/deploy.sh
EOF
sudo chmod 440 /etc/sudoers.d/cingiz-ideaflow
sudo visudo -c -f /etc/sudoers.d/cingiz-ideaflow     # «parsed OK» yazmalıdır
```

> Skript repodan gəlir: `deploy/vps/deploy.sh`. Yeniləyəndə (b) addımı təkrar icra olunmalıdır —
> qəsdən belədir, çünki Çingizin push etdiyi kod avtomatik olaraq onun icra hüququna çevrilməməlidir.

## 2. Caddy bloku

**AttendanceQR anbarındakı `Caddyfile`-a** əlavə olunur, yalnız serverdə deyil. Prod deploy `reset --hard`
edir: repoda olmayan blok növbəti deploy-da silinir (MenyuQR ilə məhz bu baş verdi).

```
# IdeaFlow — statik sayt, /srv/ideaflow-dan verilir (deploy/vps/deploy.sh yayımlayır).
ideaflow.qrlog.az {
	import security_headers
	root * /srv/ideaflow
	file_server
	encode zstd gzip
}
```

Üstəlik Caddy konteyneri həmin qovluğu görməlidir. `docker-compose.prod.yml`-də caddy xidmətinə
bir sətir əlavə olunur (landing üçün olan `./landing-dist:/srv/qrlog:ro` sətrinin yanına):

```yaml
      - /srv/ideaflow:/srv/ideaflow:ro
```

Şərtlər:
- `ideaflow.qrlog.az` A qeydi **94.20.153.137**-ə baxmalıdır. DNS hazır olmadan blok əlavə etmək
  olmaz: Caddy sertifikat almağa çalışacaq, alınmayacaq və qrlog.az üçün Let's Encrypt limitini
  yeyəcək.
- Dəyişiklik `ops/deploy-prod.sh` ilə tətbiq olunur (konteyner yenidən yaradılır). Sadəcə `reload`
  işləmir — Caddyfile bind-mount inode ilə bağlıdır.

## 3. Çingizin gündəlik işi

```bash
ssh cingiz@94.20.153.137
sudo -u deploy /opt/ideaflow/deploy.sh check      # yoxlama — sayta toxunmur
sudo -u deploy /opt/ideaflow/deploy.sh            # yayım
sudo -u deploy /opt/ideaflow/deploy.sh rollback   # bir commit geri
```

Ondan əvvəl dəyişikliyi GitHub-a push etməlidir: skript `git pull --ff-only` edir, yəni serverdə
əl ilə redaktə saxlanmır — yeganə mənbə repodur.

## 4. Nəyi edə BİLMİR

- `docker` əmrləri, konteynerlərə giriş
- `/opt`-un qalan layihələri, `.env` faylları, verilənlər bazası, ehtiyat nüsxələr
- skriptin özünü dəyişmək (fayl `deploy`-a məxsusdur, 755)
- başqa istifadəçi kimi əmr icra etmək — sudoers sətri yalnız bu bir faylı adlandırır

## 5. Geri almaq

```bash
sudo rm /etc/sudoers.d/cingiz-ideaflow
```
