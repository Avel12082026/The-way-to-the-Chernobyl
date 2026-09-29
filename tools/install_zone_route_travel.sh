#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/var/www/pocketzone}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$HERE/../server_patches/zone_route_travel_20260929.patch"
SERVER="$ROOT/server.js"

test -f "$SERVER" || { echo "server.js not found: $SERVER" >&2; exit 1; }
test -f "$PATCH" || { echo "patch not found: $PATCH" >&2; exit 1; }

if grep -q 'ZONE_ROUTE_TRAVEL_V1' "$SERVER" && grep -q 'ZONE_ROUTE_API_V1' "$SERVER"; then
  echo "Zone route travel already installed."
  exit 0
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
cp -a "$SERVER" "$SERVER.before-zone-route-travel-$STAMP"

cd "$ROOT"
patch --batch --forward -p0 < "$PATCH"
node --check "$SERVER"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart pocketzone.service
  systemctl is-active --quiet pocketzone.service
fi

echo "Installed zone route travel. Backup: $SERVER.before-zone-route-travel-$STAMP"