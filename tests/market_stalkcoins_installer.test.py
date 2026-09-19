from pathlib import Path
import importlib.util, tempfile, subprocess

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('market_installer',ROOT/'tools/install_market_stalkcoins.py')
MOD=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MOD)

SOURCE=r"""
try { db.exec(`ALTER TABLE market ADD COLUMN currency TEXT DEFAULT 'bytes'`); } catch (e) {}
function x(){ const data={breedCredits:1}; return data; }
app.post('/api/market/sell', requireAuth, (req, res) => {
    try {
        const sellerId = String(req.telegramUser.id);
        const { item, quantity, price } = req.body;
        const qty = parseInt(quantity, 10);
        const prc = parseInt(price, 10);
        const currency = 'bytes'; // old forced currency
        if (!item || !qty || qty <= 0 || !prc || prc <= 0) return res.json({success:false});
        db.prepare('INSERT INTO market (seller_id, seller_username, item, quantity, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(sellerId, null, item, qty, prc, currency, Date.now());
        return res.json({success:true});
    } catch(e) { return res.json({success:false}); }
});
app.post('/api/market/cancel', requireAuth, (req,res)=>res.json({success:true}));

app.post('/api/market/buy', requireAuth, (req, res) => {
    const buyerId = String(req.telegramUser.id);
    const lotId = parseInt(req.body.lotId, 10);
    const lot = db.prepare('SELECT * FROM market WHERE id = ?').get(lotId);
    const buyerRow = db.prepare('SELECT * FROM players WHERE id = ?').get(buyerId);
    const buyerData = safeParsePlayerData(buyerRow.data);
    if ((buyerData.coins || 0) < lot.price) return res.json({ success: false, error: 'Недостаточно Байт' });
    const sellerRow = db.prepare('SELECT * FROM players WHERE id = ?').get(lot.seller_id);
    const sellerData = sellerRow ? safeParsePlayerData(sellerRow.data) : null;
    buyerData.coins -= lot.price;
    buyerData.inventory = buyerData.inventory || {};
    buyerData.inventory[lot.item] = (buyerData.inventory[lot.item] || 0) + lot.quantity;
    const tx = db.transaction(() => {
        db.prepare('UPDATE players SET data = ? WHERE id = ?').run(JSON.stringify(buyerData), buyerId);
        if (sellerData) {
            sellerData.coins = (sellerData.coins || 0) + lot.price;
            db.prepare('UPDATE players SET data = ? WHERE id = ?').run(JSON.stringify(sellerData), lot.seller_id);
        }
        db.prepare('DELETE FROM market WHERE id = ?').run(lotId);
    });
    tx();
    res.json({ success: true });
});
// ===== ГЛОБАЛЬНЫЙ РЕЕСТР
"""

patched=MOD.build(SOURCE)
assert "requestedCurrency === 'stalkcoins'" in patched
assert "marketCurrency = lot.currency === 'stalkcoins'" in patched
assert "buyerData.breedCredits" in patched
assert "sellerData.breedCredits" in patched
assert "Недостаточно сталкоинов" in patched
assert "Недостаточно сталбайтов" in patched
assert MOD.SELL_MARKER in patched
assert MOD.BUY_MARKER in patched
assert MOD.build(patched)==patched

with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'server.js'; p.write_text(patched,encoding='utf-8')
    subprocess.run(['node','--check',str(p)],check=True)

print('PASS: guarded server market Stalcoin patch')


# Regression: the old installer used one V1 marker as an early-return guard.
# A partially installed route with that marker must now be repaired rather than accepted.
BROKEN_V1=SOURCE.replace(
    "const currency = 'bytes'; // old forced currency",
    "const currency = 'bytes'; // MARKET_STALKCOINS_V1 stale marker"
).replace(
    "if ((buyerData.coins || 0) < lot.price) return res.json({ success: false, error: 'Недостаточно Байт' });",
    "if ((buyerData.coins || 0) < lot.price) return res.json({ success: false, error: 'Недостаточно Байт' }); // MARKET_STALKCOINS_V1 stale marker"
)
repaired=MOD.build(BROKEN_V1)
assert "currency: requestedCurrency" in repaired
assert "requestedCurrency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" in repaired
assert "buyerData.breedCredits = (Number(buyerData.breedCredits) || 0) - lot.price" in repaired
assert "sellerData.breedCredits = (Number(sellerData.breedCredits) || 0) + lot.price" in repaired
assert MOD.build(repaired)==repaired


# Current production route shape captured from the active server on 2026-09-19.
LIVE_SOURCE=r"""
try { db.exec(`ALTER TABLE market ADD COLUMN currency TEXT DEFAULT 'bytes'`); } catch (e) {}
function x(){ const data={breedCredits:1}; return data; }
app.post('/api/market/sell', requireAuth, rateLimit('market-sell', 20, 10000), (req, res) => {
    try {
        const sellerId = String(req.telegramUser.id);
        const { item, quantity, price } = req.body;
        const qty = parseInt(quantity, 10);
        const prc = parseInt(price, 10);
        const currency = 'bytes'; // продажа за Telegram Stars убрана — рынок работает только на Байтах
        db.prepare('INSERT INTO market (seller_id, seller_username, item, quantity, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(sellerId, null, item, qty, prc, currency, Date.now());
        return res.json({success:true});
    } catch(e) { return res.json({success:false}); }
});
app.post('/api/market/cancel', requireAuth, (req,res)=>res.json({success:true}));
app.post('/api/market/buy', requireAuth, (req, res) => {
    const buyerId = String(req.telegramUser.id);
    const lotId = Number(req.body.lotId);
    try {
        const tx = db.transaction(() => {
            const lot = db.prepare('SELECT * FROM market WHERE id = ?').get(lotId);
            const br = db.prepare('SELECT data FROM players WHERE id = ?').get(buyerId);
            const sr = db.prepare('SELECT data FROM players WHERE id = ?').get(lot.seller_id);
            const buyer = safeParsePlayerData(br.data);
            const seller = safeParsePlayerData(sr.data);
            if ((Number(buyer.coins)||0) < lot.price) {
                const e=new Error('NO_COINS'); e.userMessage='Недостаточно Байт'; throw e;
            }
            buyer.coins=(Number(buyer.coins)||0)-lot.price;
            buyer.inventory=buyer.inventory||{};
            seller.coins=(Number(seller.coins)||0)+lot.price;
            return {ok:true};
        });
        return res.json(tx());
    } catch(e) { return res.json({success:false,error:e.userMessage||'Ошибка'}); }
});
// ===== ГЛОБАЛЬНЫЙ РЕЕСТР
"""
live=MOD.build(LIVE_SOURCE)
assert "currency: requestedCurrency" in live
assert "marketCurrency = lot.currency === 'stalkcoins' ? 'stalkcoins' : 'bytes'" in live
assert "buyer.breedCredits=(Number(buyer.breedCredits)||0)-lot.price" in live
assert "seller.breedCredits=(Number(seller.breedCredits)||0)+lot.price" in live
assert "Недостаточно сталкоинов" in live and "Недостаточно сталбайтов" in live
assert MOD.build(live)==live
with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'server.js';p.write_text(live,encoding='utf-8')
    subprocess.run(['node','--check',str(p)],check=True)
print('PASS: current live market route shape')
