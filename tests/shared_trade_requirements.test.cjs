'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const js = fs.readFileSync(path.join(__dirname, '..', 'ui', 'trade-menu.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'ui', 'trade-menu.css'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'ui', 'trade-bridge.js'), 'utf8');
const installer = fs.readFileSync(path.join(__dirname, '..', 'tools', 'install_bunker_menu.py'), 'utf8');

for (const id of ['sharedTradeVendorGrid','sharedTradeBuyStage','sharedTradeSellStage','sharedTradePlayerGrid','sharedTradeWarehouseDrop','sharedTradeWarehouseGrid','sharedTradeBuy','sharedTradeSell']) {
  assert(js.includes(`id=\"${id}\"`), `missing ${id}`);
}
assert(js.includes('📦 На склад — перетащи сюда предмет'), 'warehouse drop caption missing');
assert(js.includes("zhuchara:"), 'Zhuchara adapter missing');
assert(js.includes("leonov:"), 'Leonov adapter missing');
assert(js.includes("diesel:"), 'Diesel adapter missing');
assert(js.includes("friendly:"), 'friendly NPC adapter missing');
assert(js.includes("buyFromServer('zhuchara'"), 'Zhuchara server buy must be retained');
assert(js.includes("sellToServer('zhuchara'"), 'Zhuchara server sell must be retained');
assert(js.includes("buyFromServer('leonov'"), 'Leonov server buy must be retained');
assert(js.includes('sellToScientistsServer(item.name, 1)'), 'Leonov server sell must be retained');
assert(js.includes("sellToServer('technician'"), 'Diesel server sell must be retained');
assert(js.includes('/api/friendly/buy'), 'friendly server buy must be retained');
assert(js.includes("warehouseTransfer(direction, name, 1)"), 'warehouse transfer must remain server-authoritative');
assert(js.includes('if (queue.length >= STAGE_SIZE)'), 'trade staging must be bounded');
assert(js.includes('while (queue.length)'), 'staged transactions must be processed from the queue');
assert(js.includes('if (busy || !vendor)'), 'transaction re-entry guard missing');
assert(bridge.includes('[data-leonov-action=\"trade\"]'), 'Leonov trade bridge missing');
assert(css.includes('grid-template-columns:1fr 1fr'), 'buy/sell controls must cover the center as two full halves');
assert(css.includes('grid-template-columns:repeat(7,minmax(0,1fr))'), 'seven-column loot grid missing');
assert(installer.includes('ui/trade-menu.css?v=1'), 'trade stylesheet installer missing');
assert(installer.includes('ui/trade-menu.js?v=1'), 'trade script installer missing');
assert(installer.includes('ui/trade-bridge.js?v=1'), 'Leonov bridge installer missing');
console.log('Shared NPC trade requirements: OK');
