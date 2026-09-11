#!/usr/bin/env bash
set -euo pipefail
server=/var/www/pocketzone/server.js
base=${1:?Pass the pinned GitHub raw base URL}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
command -v pm2 >/dev/null || { echo 'PM2 не найден. Файлы не изменены. Пришлите способ запуска сервера.'; exit 1; }
pm2 jlist > "$work/processes.json"
python3 - "$work/processes.json" "$server" > "$work/ids" <<'PY'
import json,os,sys
items=json.load(open(sys.argv[1]));target=os.path.realpath(sys.argv[2])
for p in items:
 env=p.get('pm2_env',{});path=env.get('pm_exec_path','')
 if path and os.path.realpath(path)==target:print(int(p['pm_id']))
PY
[[ -s "$work/ids" ]] || { echo 'Процесс этого server.js в PM2 не найден. Файлы не изменены.'; exit 1; }
curl -fsSL "$base/server_patches/pda_loadout.json" -o "$work/patch.json"
curl -fsSL "$base/tools/install_pda_server_patch.py" -o "$work/install.py"
python3 "$work/install.py" "$server" "$work/patch.json"
while IFS= read -r id; do pm2 restart "$id"; done < "$work/ids"
echo 'Сервер обновлён и перезапущен. Пришлите этот вывод в чат для проверки API.'
