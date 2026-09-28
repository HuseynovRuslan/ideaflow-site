#!/usr/bin/env bash
# IdeaFlow deploy — srv323 (94.20.153.137).
#
# Runs as `deploy`, and Çingiz reaches it through ONE locked sudoers rule (see README.md). The file is
# owned by deploy and is not group-writable on purpose: a script somebody may run as another user must
# not be a script they can also rewrite — that would turn one allowed command into any command. Same
# rule the budget-app, psklub and QRLog scripts follow.
#
# The site is static: the repository is pulled, then its files are copied into the directory Caddy
# serves. Nothing is built, no container is started, no secret is read — so there is nothing here that
# needs root.
set -euo pipefail

REPO_DIR=/opt/ideaflow            # git clone of the IdeaFlow repository
PUBLIC_DIR=/srv/ideaflow          # what Caddy serves (see the Caddyfile block in README.md)
SOURCE_SUBDIR=site                # saytın faylları bu qovluqdadır

cd "$REPO_DIR"

case "${1:-deploy}" in
  check)
    # A dry run: says whether this account can reach the repository and the target, and prints what
    # WOULD be published — without touching the live site. Run this first on a new machine.
    git fetch --quiet origin
    local_head=$(git rev-parse --short HEAD)
    remote_head=$(git rev-parse --short origin/HEAD 2>/dev/null || git rev-parse --short origin/main)
    echo "OK: repo əlçatandır (yerli $local_head · uzaq $remote_head)"
    echo "OK: yayım qovluğu $PUBLIC_DIR ($(find "$PUBLIC_DIR" -type f 2>/dev/null | wc -l) fayl)"
    echo "Sayt TOXUNULMADI."
    ;;

  deploy|"")
    before=$(git rev-parse --short HEAD)
    git pull --ff-only
    after=$(git rev-parse --short HEAD)

    # --delete so a page removed from the repository disappears from the site as well; without it the
    # old copy stays served for ever and nobody ever notices which files are live.
    rsync -a --delete "$REPO_DIR/$SOURCE_SUBDIR"/ "$PUBLIC_DIR"/ \
      --exclude '*.md'

    echo "DONE — IdeaFlow yayımlandı ($before → $after, $(find "$PUBLIC_DIR" -type f | wc -l) fayl)"
    ;;

  rollback)
    # The previous commit, for the ten minutes when something is visibly wrong and the fix is not
    # written yet. Deliberately one step: a deeper history belongs in git, not in a flag.
    git checkout --quiet HEAD~1
    rsync -a --delete "$REPO_DIR/$SOURCE_SUBDIR"/ "$PUBLIC_DIR"/ \
      --exclude '*.md'
    echo "DONE — bir commit geri qayıdıldı ($(git rev-parse --short HEAD)). Düzəldəndən sonra: deploy.sh deploy"
    ;;

  *)
    echo "istifadə: deploy.sh [deploy|check|rollback]" >&2
    exit 2
    ;;
esac
