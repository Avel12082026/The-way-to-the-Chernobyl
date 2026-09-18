"""Guarded, idempotent corrections to the Telegram client. No server/player writes."""
from pathlib import Path
import hashlib, re

ROOT = Path(__file__).resolve().parents[1]

def edit(path, before, after):
    p = ROOT / path
    s = p.read_text(encoding='utf-8')
    if after in s:
        return
    if s.count(before) != 1:
        raise SystemExit(f'{path}: expected one exact anchor: {before[:80]}')
    p.write_text(s.replace(before, after, 1), encoding='utf-8')

edit('ui/trade-menu.js',
"    if (source === 'stock' || source === 'inventory') stage(source, name, source === 'stock' ? 'buy' : 'sell');",
"    if (source === 'stock' || source === 'inventory') {\n      stage(source, name, source === 'stock' ? 'buy' : 'sell');\n      if (typeof showItemInfoModal === 'function') showItemInfoModal(name);\n    }")
edit('ui/trade-menu.js',
"    const node = e.target.closest('[data-trade-source=\"stock\"],[data-trade-source=\"inventory\"]');",
"    const node = e.target.closest('[data-trade-source]');")
edit('ui/trade-menu.js',
"scroller: node.closest('#tradeStockScroll') || root",
"scroller: node.closest('#tradeStockScroll,#tradeInventory,.trade-staging') || root")
edit('ui/trade-menu.js',
"    if (!gesture || gesture.scrolling || busy || needsSync) return;",
"    if (!gesture || gesture.scrolling || busy || needsSync || !['stock', 'inventory'].includes(gesture.source)) return;")
edit('ui/trade-menu.js',
"version: '1.2.0', open, refresh: render, openTechnicianUpgrade(){ if (!root.hidden) hide();",
"version: '1.2.1', open, refresh: render, openTechnicianUpgrade(){ if (busy) return false; if (!root.hidden) hide();")

# Explicit names on actual item images, rather than trying to infer names from URLs/titles.
p = ROOT / 'index.html'
s = p.read_text(encoding='utf-8')
anchor = '<img src="${getIconUrl(file)}"'
replacement = '<img data-item-info="${escapeHtml(name)}" src="${getIconUrl(file)}"'
if replacement not in s:
    if s.count(anchor) != 3:
        raise SystemExit('Expected three shared item image factories')
    s = s.replace(anchor, replacement)
p.write_text(s, encoding='utf-8')

# The trade cell itself handles add/remove + info, including clicks on its image.
edit('ui/trader-hubs.js',
"    if (img && !img.closest('.trader-portrait-screen,.bunker-menu')) {",
"    if (img && !img.closest('#tradeMenu,.trader-portrait-screen,.bunker-menu')) {")
edit('ui/trader-hubs.js',
"  function itemNameFromIcon(img) {\n    const cell",
"  function itemNameFromIcon(img) {\n    if (img.dataset.itemInfo) return img.dataset.itemInfo;\n    const cell")

# A failed poll must not reset watermarks and play the same old notification on recovery.
edit('ui/trader-hubs.js',
"    let dm=false, parcel=playerParcelUnread(), system=playerSystemUnread();\n    let latestDm=0, latestParcel=0, latestSystem=0;",
"    if (window.__pdaNotificationPollBusy) return;\n    window.__pdaNotificationPollBusy = true;\n    let dm=previousState.dm, parcel=playerParcelUnread(), system=playerSystemUnread();\n    let latestDm=previousState.latestDm, latestParcel=previousState.latestParcel, latestSystem=previousState.latestSystem;")
edit('ui/trader-hubs.js',
"      const list = await r.json();\n      const myId",
"      if (!r.ok) throw new Error('DM poll HTTP ' + r.status);\n      const list = await r.json();\n      if (!Array.isArray(list)) throw new Error('Invalid DM conversations');\n      const myId")
edit('ui/trader-hubs.js',
"      latestDm = Math.max(0,...incoming.map",
"      latestDm = Math.max(previousState.latestDm,...incoming.map")
edit('ui/trader-hubs.js',
"      const messages = await r.json();\n      const sys",
"      if (!r.ok) throw new Error('System poll HTTP ' + r.status);\n      const messages = await r.json();\n      if (!Array.isArray(messages)) throw new Error('Invalid system messages');\n      const sys")
edit('ui/trader-hubs.js',
"    notificationReady=true;\n  }",
"    notificationReady=true;\n    window.__pdaNotificationPollBusy = false;\n  }")
edit('ui/trader-hubs.js',
"      ensureBadges(document.getElementById('kpkChatBtn'),'kpk')",
"      ensureBadges(document.getElementById('kpkChatBtn'),'kpk'),\n      ensureBadges(document.getElementById('raidTelegramBtn'),'raid')")
edit('ui/trader-hubs.js',
"      dots[kind].classList.toggle('active', !!state[kind]);",
"      dots[kind].classList.toggle('active', !!state[kind]);\n      dots[kind].setAttribute('aria-hidden', String(!state[kind]));")

css = ROOT / 'ui/trader-hubs.css'
s = css.read_text(encoding='utf-8')
marker = '/* INTERACTION_REGRESSION_FIXES */'
if marker not in s:
    s += '''\n\n/* INTERACTION_REGRESSION_FIXES */\n/* Do not displace the absolutely positioned PDA hotspot when adding badges. */\n#mainMenu #bunkerPda.pda-notification-host{position:absolute!important}\n/* Item images must receive taps outside the trade grid as well. */\nimg[data-item-info],#inventoryScreen #inventoryGrid [data-drag-item] img[data-item-info],#warehouseScreen [data-drag-item] img[data-item-info]{pointer-events:auto!important;cursor:pointer}\n/* Info and speech remain above portrait screens and stacked picker dialogs. */\n#gameAlertModal,#gameConfirmModal{z-index:100010!important}\n#itemInfoModal,#profileItemModal{z-index:100020!important}\n/* Upgrade-only view contains no legacy portrait, header artwork, or sell tab. */\n#technicianScreen[data-diesel-upgrade-only="true"] .zr-title img,\n#technicianScreen[data-diesel-upgrade-only="true"] .zr-title-icon{display:none!important}\n#technicianScreen[data-diesel-upgrade-only="true"] .zr-title{background:none!important}\n#technicianScreen[data-diesel-upgrade-only="true"] .zr-title .zr-sr{position:static!important;width:auto!important;height:auto!important;clip:auto!important;clip-path:none!important;overflow:visible!important}\n/* Keep all message indicators consistent with the requested green chat dot. */\n.pda-notification-dot,#dmUnreadDot{background:#42d66b!important;color:#42d66b!important}\n'''
    css.write_text(s,encoding='utf-8')

# Refresh exact tags only, preserving script order and concurrent unrelated markup.
p = ROOT/'index.html'
s = p.read_text(encoding='utf-8')
for rel in ['ui/trade-menu.js','ui/trader-hubs.js','ui/trader-hubs.css']:
    version=hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()[:12]
    pattern=r'((?:src|href)="'+re.escape(rel)+r')(?:\?[^\"]*)?("[^>]*>)'
    s,n=re.subn(pattern,lambda m:m[1]+'?v='+version+m[2],s)
    if n!=1: raise SystemExit('Missing/duplicate script or stylesheet: '+rel)
p.write_text(s,encoding='utf-8')
print('Interaction regressions fixed; player data and server unchanged')
