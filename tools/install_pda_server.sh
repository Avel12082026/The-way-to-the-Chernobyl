#!/usr/bin/env bash
set -euo pipefail
server=/var/www/pocketzone/server.js
base=${1:?Pass the pinned GitHub raw base URL}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
service=pocketzone.service
[[ "$(systemctl show "$service" -p WorkingDirectory --value)" == /var/www/pocketzone ]] || { echo 'Не совпадает папка службы. Файлы не изменены.'; exit 1; }
systemctl show "$service" -p ExecStart --value | grep -q 'server.js' || { echo 'Не подтверждён запуск server.js. Файлы не изменены.'; exit 1; }
curl -fsSL "$base/server_patches/pda_loadout.json" -o "$work/patch.json"
curl -fsSL "$base/tools/install_pda_server_patch.py" -o "$work/install.py"
python3 "$work/install.py" "$server" "$work/patch.json"
systemctl restart "$service"
systemctl is-active --quiet "$service"
echo 'Сервер обновлён и перезапущен. Пришлите этот вывод в чат для проверки API.'
