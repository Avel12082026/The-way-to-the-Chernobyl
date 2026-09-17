"""Install the approved Telegram hub only; fail closed on unfamiliar client anchors."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'index.html'
source = path.read_text(encoding='utf-8')
marker = '<!-- BUNKER_MENU_V1 -->'
if marker in source:
    print('Bunker menu already installed')
    raise SystemExit(0)
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

def once(before, after):
    global source
    assert source.count(before) == 1, 'Unexpected/missing anchor: ' + before[:80]
    source = source.replace(before, after, 1)

once('</head>', '<link rel="stylesheet" href="ui/bunker-menu.css?v=1">\n</head>')
once('</body>', '<script src="ui/bunker-menu.js?v=1"></script>\n</body>')
once("setText('starsShopNicknameDisplayBottom', nicknameCount);", "setText('starsShopNicknameDisplayBottom', nicknameCount);\n        window.BunkerMenu?.refresh();")
# Let the illustrated button await the ORIGINAL book API and reject double taps.
once("        applyInventoryItem('Книга знаний');", "        return applyInventoryItem('Книга знаний');")
once("if(itemName==='Книга знаний'){\n            closeItemActionModal();\n            (async()=>{", "if(itemName==='Книга знаний'){\n            closeItemActionModal();\n            return (async()=>{")
# The raster-caption decorator must never paint over transparent hit areas.
once("  if(b.classList.contains('zr-menu-button'))return;", "  if(b.classList.contains('zr-menu-button') || b.closest('#bunkerScene'))return;")
assert source.count('id="mainMenu"') == 1
assert source.count('id="bunkerScene"') == 1
path.write_text(source, encoding='utf-8')
print('Installed Telegram bunker menu; existing server endpoints and Android files unchanged')
