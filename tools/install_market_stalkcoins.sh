#!/usr/bin/env bash
set -euo pipefail
server=/var/www/pocketzone/server.js
service=pocketzone.service
base=${1:-https://raw.githubusercontent.com/Avel12082026/The-way-to-the-Chernobyl/main}
command -v systemctl >/dev/null || { echo 'Запусти установку на сервере через SSH, не прямо в Termux.'; exit 1; }
[[ -f "$server" ]] || { echo 'Не найден /var/www/pocketzone/server.js'; exit 1; }
[[ "$(systemctl show "$service" -p WorkingDirectory --value)" == /var/www/pocketzone ]] || { echo 'Не совпадает рабочая папка службы. Файлы не изменены.'; exit 1; }
systemctl show "$service" -p ExecStart --value | grep -q 'server.js' || { echo 'Не подтверждён запуск server.js. Файлы не изменены.'; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 2 "$base/tools/install_market_stalkcoins.py" -o "$work/install.py"
python3 "$work/install.py" "$server" --check
python3 "$work/install.py" "$server"
systemctl restart "$service"
systemctl is-active --quiet "$service"
echo 'Сервер перезапущен. Рынок теперь поддерживает сталбайты и сталкоины.'
