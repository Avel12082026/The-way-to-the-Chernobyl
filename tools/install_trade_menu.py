"""Idempotent Telegram-only integration; keep Android/client business logic unchanged."""
from pathlib import Path
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'index.html'
source = path.read_text(encoding='utf-8')
for marker in ('id="mainMenu"', 'id="shopScreen"', 'id="scientistsScreen"',
               'id="technicianScreen"', 'id="friendlyTradeModal"',
               'function buyFromServer(', 'function sellToServer(',
               'async function warehouseTransfer(', 'ui/bunker-menu.js'):
    if marker not in source:
        raise SystemExit('Unexpected client: missing ' + marker)
for suffix in ('css', 'js'):
    asset = ROOT / 'ui' / ('trade-menu.' + suffix)
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    if suffix == 'css':
        tag = f'<link rel="stylesheet" href="ui/trade-menu.css?v={version}">'
        pattern = r'<link\b[^>]*href="ui/trade-menu\.css(?:\?[^\"]*)?"[^>]*>'
        anchor = '</head>'
    else:
        tag = f'<script src="ui/trade-menu.js?v={version}"></script>'
        pattern = r'<script\b[^>]*src="ui/trade-menu\.js(?:\?[^\"]*)?"[^>]*>\s*</script>'
        anchor = '</body>'
    if re.search(pattern, source):
        source, count = re.subn(pattern, lambda _: tag, source)
        if count != 1: raise SystemExit('Duplicate trade asset tag')
    else:
        if source.count(anchor) != 1: raise SystemExit('Unexpected HTML boundary')
        source = source.replace(anchor, tag + '\n' + anchor, 1)
if source.index('ui/trade-menu.js') < source.index('ui/bunker-menu.js'):
    raise SystemExit('Trade integration must load after the Leonov hub')
path.write_text(source, encoding='utf-8')
print('Unified NPC trade installed; server endpoints, Android and player data unchanged')
