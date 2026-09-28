#!/usr/bin/env bash
# IdeaFlow tətbiqi — srv323 yayımı.
#
# Bu, `deploy/deploy.sh`-ın (statik sayt) tətbiq üçün variantıdır. Təhlükəsizlik modeli
# EYNİ QALIR və qəsdən belədir:
#
#   • Skript `deploy` istifadəçisinə məxsusdur, Çingiz üçün yazıla bilməz.
#   • Çingiz eyni bir sudoers sətri ilə yalnız bu faylı işə sala bilir.
#   • Çingizə docker qrupu VERİLMİR və verilməməlidir — konteyner bütün diski,
#     o cümlədən başqa layihələrin .env sirlərini oxuya bilər.
#   • `deploy` onsuz da docker qrupundadır (docker:x:988:deploy), ona görə konteyneri
#     qaldırmaq üçün yeni icazəyə ehtiyac yoxdur.
#
# Statik variantdan fərqi: sayt artıq fayl yığını deyil — build olunur və konteynerdə
# işləyir. Ona görə `rsync` əvəzinə `docker compose up`, və sonda sağlamlıq yoxlaması var:
# statik fayl «qalxa bilməz», konteyner isə bilər.
set -euo pipefail

REPO_DIR=/opt/ideaflow          # anbarın klonu
APP_DIR=$REPO_DIR/app           # compose faylı burada
HEALTH=http://127.0.0.1:8100/api/health

cd "$REPO_DIR"

# .env yalnız serverdə yaşayır (baza parolu, ilk admin parolu) və anbara heç vaxt düşmür.
# Yoxdursa deploy dayanır — yarımçıq qalxmış tətbiqdən yaxşıdır.
require_env() {
  if [[ ! -f $APP_DIR/.env ]]; then
    echo "XƏTA: $APP_DIR/.env yoxdur. Sahib onu bir dəfə yaratmalıdır (app/README.md)." >&2
    exit 1
  fi
}

wait_health() {
  local tries=${1:-30}
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1; then
      echo "OK: tətbiq cavab verir ($HEALTH)"
      return 0
    fi
    sleep 2
  done
  echo "XƏTA: tətbiq $((tries * 2)) saniyədə qalxmadı." >&2
  echo "       Loglar:   $0 logs" >&2
  echo "       Geri al:  $0 rollback" >&2
  return 1
}

case "${1:-deploy}" in
  check)
    # Quru sınaq: anbara və konteynerə çatırıqmı, nə yayımlanacaq — sayta toxunmadan.
    git fetch --quiet origin
    local_head=$(git rev-parse --short HEAD)
    remote_head=$(git rev-parse --short origin/main)
    echo "OK: repo əlçatandır (yerli $local_head · uzaq $remote_head)"
    [[ -f $APP_DIR/.env ]] && echo "OK: .env yerindədir" || echo "DİQQƏT: $APP_DIR/.env yoxdur"
    (cd "$APP_DIR" && docker compose config >/dev/null) && echo "OK: compose konfiqi etibarlıdır"
    curl -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1 \
      && echo "OK: hazırkı tətbiq canlıdır" \
      || echo "DİQQƏT: hazırda cavab verən tətbiq yoxdur"
    echo "Sayt TOXUNULMADI."
    ;;

  deploy|"")
    require_env
    before=$(git rev-parse --short HEAD)
    git pull --ff-only
    after=$(git rev-parse --short HEAD)

    if [[ $before == "$after" ]]; then
      echo "Dəyişiklik yoxdur ($after) — yenə də yenidən qurulur."
    else
      echo "Yenilənir: $before → $after"
    fi

    (cd "$APP_DIR" && docker compose up -d --build)
    wait_health 30
    echo "DONE — ideaflow yayımlandı ($after)"
    ;;

  rollback)
    require_env
    # Bir commit geri. Statik variantda olduğu kimi — yeganə mənbə anbardır,
    # serverdə əl ilə düzəliş saxlanmır.
    now=$(git rev-parse --short HEAD)
    git reset --hard --quiet HEAD~1
    back=$(git rev-parse --short HEAD)
    echo "Geri alınır: $now → $back"
    (cd "$APP_DIR" && docker compose up -d --build)
    wait_health 30
    echo "DONE — $back bərpa edildi"
    ;;

  logs)
    (cd "$APP_DIR" && docker compose logs --tail 80 app)
    ;;

  backup)
    # Baza yedəyi. Fayllar deploy-a məxsus qovluqda qalır, anbara düşmür.
    mkdir -p /opt/ideaflow-backups
    out="/opt/ideaflow-backups/ideaflow-$(date +%F-%H%M).sql.gz"
    (cd "$APP_DIR" && docker compose exec -T db pg_dump -U ideaflow ideaflow) | gzip > "$out"
    echo "DONE — $out"
    ;;

  *)
    echo "istifadə: deploy.sh [deploy|check|rollback|logs|backup]" >&2
    exit 2
    ;;
esac
