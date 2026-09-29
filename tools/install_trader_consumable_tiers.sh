#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/pocketzone}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$HERE/../server_patches/trader_consumable_tiers_20260929.patch"
SERVER="$ROOT/server.js"

test -f "$SERVER" || { echo "server.js not found: $SERVER" >&2; exit 1; }
test -f "$PATCH" || { echo "patch not found: $PATCH" >&2; exit 1; }

if grep -q 'TRADER_CONSUMABLE_TIERS_V1' "$SERVER"; then
  echo "Trader consumable tiers already installed."
  exit 0
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
cp -a "$SERVER" "$SERVER.before-trader-consumables-$STAMP"
cd "$ROOT"
patch --batch --forward -p0 < "$PATCH"
node --check "$SERVER"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart pocketzone.service
  systemctl is-active --quiet pocketzone.service
fi

echo "Installed trader consumable tiers. Backup: $SERVER.before-trader-consumables-$STAMP"