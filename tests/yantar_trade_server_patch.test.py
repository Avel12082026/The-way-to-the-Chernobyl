#!/usr/bin/env python3
import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_yantar_trade_fixes.py'
spec=importlib.util.spec_from_file_location('yantar_trade',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const SHOP_DETECTORS=[];
const app={post(){}};
const requireAuth=()=>{};
const rateLimit=()=>{};
const db={};
const safeParsePlayerData=()=>({});
const countNonStackingSlotsServer=()=>0;
function resolveSellPriceServer(){return{category:'artifact',price:1,isNamed:false}}
// Продажа Эколог Леонову — артефакты (базовые/гибриды +35%, именные — 50 Жетонов сталкера
// строго по одному) и части тел мутантов (+20%)
app.post('/api/scientists/sell', requireAuth, rateLimit('shop-sell', 30, 10000), (req, res) => {
    const resolved = resolveSellPriceServer(name, playerId);
    if (resolved.category !== 'artifact' && resolved.category !== 'loot') {
        return res.json({ success: false, error: 'Леонов покупает только артефакты и части тел мутантов' });
    }
    const markup = resolved.category === 'artifact' ? 1.35 : 1.20;
});
// CORDON_TECHNICIAN_DETECTOR_BUY_V1
app.post('/api/shop/buy',(req,res,next)=>next());
app.post('/api/shop/buy', requireAuth, rateLimit('shop-buy', 20, 10000), (req, res) => {
        } else if (category === 'detector') {
            item = SHOP_DETECTORS.find(d => d.name === name);
            if (!item) return res.json({ success: false, error: 'Детектор не найден' });
        } else if (category === 'armor') {
});
"""
patched,changed=mod.patch(source)
assert changed
assert patched.count(mod.VIZIR_MARK)==1
assert "DIESEL_VIZIR_STALKCOIN_PRICE=100" in patched
assert "sourceVendor!=='technician'||category!=='detector'||name!=='ВИЗИРЬ'" in patched
assert "data.breedCredits<DIESEL_VIZIR_STALKCOIN_PRICE" in patched
assert "data.breedCredits-=DIESEL_VIZIR_STALKCOIN_PRICE" in patched
assert "item.specialOnly" in patched and "ВИЗИРЬ продаётся у Дизеля за 100 сталкоинов" in patched
assert "['artifact','loot','weapon','armor'].includes(resolved.category)" in patched
assert "resolved.category === 'loot' ? 1.20 : 1" in patched

patched2,changed2=mod.patch(patched)
assert not changed2
assert patched2==patched
print('PASS: Yantar trade installer is idempotent and guards Vizir/Leonov server rules')