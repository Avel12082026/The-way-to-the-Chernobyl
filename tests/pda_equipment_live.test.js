'use strict';
// Read-only smoke check of the public profile contract and the icons used by the PDA.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
const out = process.argv[2];
function block(re) { const m=html.match(re); assert.ok(m,`Missing block ${re}`); return m[0]; }
function func(name) {return block(new RegExp('^    function '+name+'\\([^]*?^    }','m'));}
const context = vm.createContext({});
vm.runInContext([
    block(/    const SERVER_URL = '[^']+';/),
    block(/    const ADMIN_ID = '[^']+';/),
    block(/    const DEFAULT_WEAPON = \{[^\n]+;/),
    block(/    const DEFAULT_DETECTOR = \{[^\n]+;/),
    block(/    const EMPTY_SLOT_ICONS = \{[^\n]+;/),
    block(/    const ITEM_ICONS = \{[\s\S]*?\n    \};/),
    block(/    const CLIENT_ICON_VERSIONS = new Map\(\[[\s\S]*?\n    \]\);/),
    ...['stripInvisibleSuffix','parseGearName','getIconUrl','getProfileEquipmentVisual'].map(func)
].join('\n'),context);
const evaluate = code => vm.runInContext(code,context);
async function get(url) {
    const response = await fetch(url, {signal:AbortSignal.timeout(30000),headers:{'User-Agent':'PDA-equipment-read-only-check','Cache-Control':'no-cache'}});
    assert.ok(response.ok, `HTTP ${response.status}: ${url}`);
    return response;
}
(async()=>{
    const server=evaluate('SERVER_URL');
    const id=evaluate('ADMIN_ID');
    const profile=await (await get(`${server}/api/player/${encodeURIComponent(id)}`)).json();
    assert.ok(profile && typeof profile==='object');
    for (const kind of ['weapon','detector']) {
        assert.equal(typeof profile[kind]?.name,'string',`Public profile must expose ${kind}.name`);
    }
    context.profile={weapon:profile.weapon,detector:profile.detector};
    const visuals=JSON.parse(evaluate("JSON.stringify(['weapon','detector'].map(kind=>getProfileEquipmentVisual(profile,kind)))"));
    assert.ok(visuals.every(x=>x.src && !x.missingIcon),'Equipped item icon must be mapped');
    const files=new Set(['empty_slot_weapon.png','empty_slot_detector.png','pistolet_makarova.png','avtomat_ak74.png','riper.jpg','vizir.jpg']);
    for(const visual of visuals) files.add(new URL(visual.src,server).pathname.split('/').pop());
    const checked=[];
    if (out) fs.mkdirSync(path.join(out,'assets'),{recursive:true});
    for(const file of files) {
        assert.equal(file,path.basename(file));
        const response=await get(`${server}/icons/${encodeURIComponent(file)}`);
        assert.match(response.headers.get('content-type')||'',/^image\//);
        const bytes=Buffer.from(await response.arrayBuffer());
        assert.ok(bytes.length>100,`Empty image: ${file}`);
        checked.push({file,bytes:bytes.length,contentType:response.headers.get('content-type')});
        if(out) fs.writeFileSync(path.join(out,'assets',file),bytes);
    }
    if(out) {
        // Export only public appearance fields for offline rendering, not player balances or inventory.
        fs.writeFileSync(path.join(out,'appearance.json'),JSON.stringify({
            weapon:{name:profile.weapon.name},detector:{name:profile.detector.name},
            armor:{name:profile.armor?.name||'Без брони'}
        },null,2));
        fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({
            publicProfileContract:'weapon.name and detector.name available',
            httpImageChecks:checked,privateEndpointsUsed:false,playerDataChanged:false
        },null,2));
    }
    console.log(`PASS: live public profile exposes weapon.name and detector.name; ${checked.length} icon URLs return images; GET requests only.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
