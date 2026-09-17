"""Install the approved Telegram hub and shared NPC trade workspace; fail closed on unfamiliar anchors."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'index.html'
source = path.read_text(encoding='utf-8')


def once(before, after):
    global source
    assert source.count(before) == 1, 'Unexpected/missing anchor: ' + before[:100]
    source = source.replace(before, after, 1)


# Main illustrated bunker menu: install only once.
marker = '<!-- BUNKER_MENU_V1 -->'
if marker not in source:
    image = ROOT / 'file_000000002bb08210800056ebfb1dce1f.png'
    assert image.is_file() and image.stat().st_size > 100000, 'Approved artwork missing'
    start = source.index('<div class="menu zr-menu" id="mainMenu">')
    end = source.index('<!-- One chat widget, permanently hosted in the PDA chat screen. -->', start)
    old_menu = source[start:end]
    assert old_menu.count('<nav') == 1 and old_menu.rstrip().endswith('</nav></div>'), 'Unexpected main menu boundary'
    for handler in ["openScreen('inventory')", "openScreen('shop')", "startRaid()", "openScreen('warehouse')", "openScreen('technician')", "openScreen('scientists')", "openScreen('kpk')", "openScreen('arena')"]:
        assert handler in old_menu, 'Original navigation not found: ' + handler
    replacement = (ROOT / 'ui/bunker-menu.html').read_text(encoding='utf-8')
    source = source[:start] + marker + '\n' + replacement + '\n' + source[end:]

    once('</head>', '<link rel="stylesheet" href="ui/bunker-menu.css?v=2">\n</head>')
    once('</body>', '<script src="ui/bunker-menu.js?v=2"></script>\n</body>')
    once("setText('starsShopNicknameDisplayBottom', nicknameCount);", "setText('starsShopNicknameDisplayBottom', nicknameCount);\n        window.BunkerMenu?.refresh();")
    # Let the illustrated button await the ORIGINAL book API and reject double taps.
    once("        applyInventoryItem('Книга знаний');", "        return applyInventoryItem('Книга знаний');")
    once("if(itemName==='Книга знаний'){\n            closeItemActionModal();\n            (async()=>{", "if(itemName==='Книга знаний'){\n            closeItemActionModal();\n            return (async()=>{")
    # The raster-caption decorator must never paint over transparent hit areas.
    once("  if(b.classList.contains('zr-menu-button'))return;", "  if(b.classList.contains('zr-menu-button') || b.closest('#bunkerScene'))return;")

# Existing installations may still carry v=1. Keep the asset URL current without duplicating tags.
source = source.replace('ui/bunker-menu.css?v=1', 'ui/bunker-menu.css?v=2')
source = source.replace('ui/bunker-menu.js?v=1', 'ui/bunker-menu.js?v=2')

# Shared NPC trading UI is additive and idempotent. It deliberately leaves all original
# purchase/sale/warehouse functions in index.html and calls those server-authoritative helpers.
trade_css = '<link rel="stylesheet" href="ui/trade-menu.css?v=1">'
if trade_css not in source:
    assert source.count('</head>') == 1
    source = source.replace('</head>', trade_css + '\n</head>', 1)

trade_js = '<script src="ui/trade-menu.js?v=1"></script>'
bridge_js = '<script src="ui/trade-bridge.js?v=1"></script>'
if trade_js not in source:
    anchor = '<script src="ui/bunker-menu.js?v=2"></script>'
    assert source.count(anchor) == 1, 'Bunker script anchor missing for trade installer'
    source = source.replace(anchor, anchor + '\n' + trade_js + '\n' + bridge_js, 1)
elif bridge_js not in source:
    source = source.replace(trade_js, trade_js + '\n' + bridge_js, 1)

assert source.count('id="mainMenu"') == 1
assert source.count('id="bunkerScene"') == 1
assert source.count('ui/trade-menu.css?v=1') == 1
assert source.count('ui/trade-menu.js?v=1') == 1
assert source.count('ui/trade-bridge.js?v=1') == 1
path.write_text(source, encoding='utf-8')
print('Installed Telegram bunker menu + shared NPC trade workspace; server endpoints unchanged')
