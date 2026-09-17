"""Idempotent, narrowly scoped Telegram client installer; no server or APK changes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
anchor = '<script src="ui/bunker-menu.js?v=1"></script>'
updated_anchor = '<script src="ui/bunker-menu.js?v=trade-1"></script>'
if html.count(anchor) == 1:
    html = html.replace(anchor, updated_anchor)
elif html.count(updated_anchor) != 1:
    raise SystemExit('Unexpected bunker loader: refusing to modify index.html')
css = '<link rel="stylesheet" href="ui/universal-trade.css?v=1">'
js = '<script src="ui/universal-trade.js?v=1"></script>'
if 'ui/universal-trade.css' not in html:
    assert html.count('</head>') == 1
    html = html.replace('</head>', css + '\n</head>')
if 'ui/universal-trade.js' not in html:
    html = html.replace(updated_anchor, updated_anchor + '\n' + js)
assert html.count('ui/universal-trade.js') == 1
assert html.index('ui/bunker-menu.js') < html.index('ui/universal-trade.js')
page.write_text(html, encoding='utf-8')
print('Universal NPC trade installed; existing routes, server code and APK preserved.')
