# IdeaFlow — sayt

Bu anbarda YALNIZ ictimai sayt və onun yayım qaydası var. Konsepsiya, vision kitabları və maliyyə
modeli bura daxil DEYİL — onlar daxili sənədlərdir və GitHub-a qoyulmur.

    site/       saytın faylları (Caddy məhz bunu verir)
    deploy/     serverdə yayım: kilidli skript + təlimat

Anbar açıqdır ki, server kodu heç bir açar və parol olmadan çəkə bilsin — QRLog-un özü də belə işləyir.
Buraya heç vaxt parol, açar və ya daxili sənəd qoyulmamalıdır.

## Yayım

Serverdə (srv323, 94.20.153.137):

    sudo -u deploy /opt/ideaflow/deploy.sh check      # yoxlama, sayta toxunmur
    sudo -u deploy /opt/ideaflow/deploy.sh            # yayım
    sudo -u deploy /opt/ideaflow/deploy.sh rollback   # bir commit geri

Ətraflı — `deploy/README.md`.
