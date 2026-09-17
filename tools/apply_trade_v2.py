"""Apply the 2026-09-18 trade/hub corrections deterministically."""
from pathlib import Path
import hashlib, re

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, before, after):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    count = s.count(before)
    if count == 1:
        p.write_text(s.replace(before, after, 1), encoding='utf-8')
        return True
    if count == 0 and after in s:
        return False
    raise SystemExit(f'{path}: expected one anchor or an already-applied replacement, found {count}: {before[:80]}')

js = 'ui/trade-menu.js'
p = ROOT / js
s = p.read_text(encoding='utf-8')
visible_line = "  const VISIBLE_GRID_SLOTS = 21; // 7 x 3: merchant and player show the same number of visible cells"
if visible_line not in s:
    anchor = "  const MAX_SLOTS = 6;"
    if s.count(anchor) != 1: raise SystemExit('trade-menu.js: MAX_SLOTS anchor mismatch')
    p.write_text(s.replace(anchor, anchor + '\n' + visible_line, 1), encoding='utf-8')

replace_once(js,
"        ...consumables.filter(c => ['medkit', 'antirad'].includes(c.type)).map(c => ({...c, category: 'consumable'})),\n        ...detectors.filter(d => d.tier <= getDetectorUnlockTier(player.level)).map(d => ({...d, category: 'detector'})),\n        ...armorItems.filter(a => a.isResearchSuit && a.tier <= getResearchSuitUnlockTier(player.level)).map(a => ({...a, category: 'armor'}))",
"        ...consumables.filter(c => ['medkit', 'antirad'].includes(c.type)).map(c => ({...c, category: 'consumable'})),\n        ...armorItems.filter(a => a.isResearchSuit && a.tier <= getResearchSuitUnlockTier(player.level)).map(a => ({...a, category: 'armor'}))")
replace_once(js,
"      // The current server buys equipment here; do not invent a new sell catalog.\n      stock: () => [], price: () => 0,",
"      // Detectors are sold by Diesel now; use the same level gate that previously lived at Leonov.\n      stock: () => detectors.filter(d => d.tier <= getDetectorUnlockTier(player.level)).map(d => ({...d, category: 'detector'})),\n      price: item => getBuyPrice(item.price),")
replace_once(js, "      fillEmpty(grid, 35, 7);", "      fillEmpty(grid, VISIBLE_GRID_SLOTS, 7);")
replace_once(js, "      fillEmpty(grid, 14, 7);", "      fillEmpty(grid, VISIBLE_GRID_SLOTS, 7);")
replace_once(js, "    el('tradeStockNote').textContent = 'Дизель выкупает снаряжение. Товаров для покупки у него пока нет.';",
                  "    el('tradeStockNote').textContent = 'У этого торговца сейчас нет доступных товаров.';")
replace_once(js,
"    if (id === 'leonov' && window.BunkerMenu?.openLeonov) window.BunkerMenu.openLeonov();\n    else if (id === 'friendly') await native.closeFriendlyTrade();\n    else if (id === 'technician') { technicianTab = 'upgrade'; native.openScreen('technician'); }\n    else native.openScreen('main');",
"    if (id === 'leonov' && window.BunkerMenu?.openLeonov) window.BunkerMenu.openLeonov();\n    else if (id === 'zhuchara' && window.TraderHubs?.openZhuchara) window.TraderHubs.openZhuchara();\n    else if (id === 'friendly') await native.closeFriendlyTrade();\n    else if (id === 'technician') { technicianTab = 'upgrade'; native.openScreen('technician'); }\n    else native.openScreen('main');")
replace_once(js, "window.TradeMenu = Object.freeze({version: '1.0.0', open, refresh: render});",
                  "window.TradeMenu = Object.freeze({version: '1.1.0', open, refresh: render});")

css = ROOT / 'ui/trade-menu.css'
css_text = css.read_text(encoding='utf-8')
marker = '/* TRADE_V2_SCROLL_GRIDS */'
if marker not in css_text:
    css_text += '''\n\n/* TRADE_V2_SCROLL_GRIDS */\n/* Merchant and player inventories expose the same 7x3 viewport, then scroll. */\n#tradeMenu .trade-stock-scroll,#tradeMenu #tradeInventory{max-height:min(24dvh,210px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:1px 0 3px;align-content:start}\n/* Both staging lists remain compact and independently scroll when more positions are queued. */\n#tradeMenu .trade-staging{max-height:min(18dvh,150px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;align-content:start}\n@media(min-width:600px){#tradeMenu .trade-stock-scroll,#tradeMenu #tradeInventory{max-height:246px}#tradeMenu .trade-staging{max-height:166px}}\n'''
    css.write_text(css_text, encoding='utf-8')

index = ROOT / 'index.html'
s = index.read_text(encoding='utf-8')
for suffix in ('css','js'):
    asset = ROOT / 'ui' / f'trader-hubs.{suffix}'
    if not asset.is_file(): raise SystemExit('Missing ' + str(asset))
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    if suffix == 'css':
        tag = f'<link rel="stylesheet" href="ui/trader-hubs.css?v={version}">'
        pattern = r'<link\b[^>]*href="ui/trader-hubs\.css(?:\?[^\"]*)?"[^>]*>'
        anchor = '</head>'
    else:
        tag = f'<script src="ui/trader-hubs.js?v={version}"></script>'
        pattern = r'<script\b[^>]*src="ui/trader-hubs\.js(?:\?[^\"]*)?"[^>]*>\s*</script>'
        anchor = '</body>'
    if re.search(pattern, s):
        s, n = re.subn(pattern, lambda _: tag, s)
        if n != 1: raise SystemExit('Duplicate trader hub asset tag')
    else:
        if s.count(anchor) != 1: raise SystemExit('Unexpected HTML boundary')
        s = s.replace(anchor, tag + '\n' + anchor, 1)

for suffix in ('css','js'):
    asset = ROOT / 'ui' / f'trade-menu.{suffix}'
    version = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
    if suffix == 'css':
        pattern = r'<link\b[^>]*href="ui/trade-menu\.css(?:\?[^\"]*)?"[^>]*>'
        tag = f'<link rel="stylesheet" href="ui/trade-menu.css?v={version}">'
    else:
        pattern = r'<script\b[^>]*src="ui/trade-menu\.js(?:\?[^\"]*)?"[^>]*>\s*</script>'
        tag = f'<script src="ui/trade-menu.js?v={version}"></script>'
    s, n = re.subn(pattern, lambda _: tag, s)
    if n != 1: raise SystemExit('Missing/duplicate trade asset tag')

if s.index('ui/trader-hubs.js') < s.index('ui/trade-menu.js'):
    raise SystemExit('Trader hubs must load after trade menu')
index.write_text(s, encoding='utf-8')
print('Trade v2 applied: equal scroll grids, Diesel detectors, trader portrait hubs')
