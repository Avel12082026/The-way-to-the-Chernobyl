'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2]);
}
function getFunction(name) {
    const re = new RegExp('^    function ' + name + '\\([^]*?^    }', 'm');
    const match = html.match(re);
    assert.ok(match, `missing ${name}`);
    return match[0];
}
function getBlock(re) { const m = html.match(re); assert.ok(m); return m[0]; }
const content = { innerHTML: '' };
const pending = new Map();
const requests = [];
const context = vm.createContext({
    console, Set, Object, Boolean, String, encodeURIComponent,
    document: {getElementById: () => content},
    SERVER_URL: 'https://test.invalid', ADMIN_ID: 'owner',
    DEFAULT_ARMOR: {name:'Без брони'}, DEFAULT_CHARACTER_PORTRAIT:'character_portrait.png',
    player: {armor:{name:'Комбинезон Юность'}},
    getPlayerId: () => 'owner', factionLabel: () => 'Одиночка',
    getRankTitle: () => 'Новичок', formatByTier: () => 'нет данных',
    formatFullDateTime: () => '', renderPerksBlock: () => '', renderEquipmentDetails: () => '',
    renderKpk: () => {content.innerHTML = 'own-card';},
    fetchMyFriendIds: () => Promise.resolve(new Set()),
    escapeHtml: value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    fetch: (url, opts) => {
        requests.push({url, opts});
        return new Promise(resolve => pending.set(url.split('/').pop(), resolve));
    }
});
vm.runInContext([
    getBlock(/    const ARMOR_CHAR_IMAGES = \{[\s\S]*?\n    \};/),
    getBlock(/    const CLIENT_ICON_VERSIONS = new Map\(\[[\s\S]*?\n    \]\);/),
    "let kpkTab = 'info'; let kpkProfileRequestId = 0;",
    ...['stripInvisibleSuffix','parseGearName','getIconUrl','getProfileArmorVisual','handleProfileArmorError',
        'renderProfileAppearance','renderPlayerStatsCard','openKpkTab','showPlayerInfo'].map(getFunction)
].join('\n'), context);
function run(code) {return vm.runInContext(code,context);}
const mapping = JSON.parse(run('JSON.stringify(ARMOR_CHAR_IMAGES)'));
let cases = 0;
for (const [name, file] of Object.entries(mapping)) {
    for (const suffix of ['', ' +9', ' +9\u200B\u200C']) {
        context.sample = {armor:{name:name + suffix}};
        const visual = run('getProfileArmorVisual(sample)');
        assert.equal(visual.src.split('?')[0].split('/').pop(),file);
        assert.ok(!visual.label.includes('\u200B'));
        assert.equal(visual.unavailable,false);
        cases++;
    }
}
assert.ok(cases >= 288);
assert.match(run("getProfileArmorVisual({armor:{name:'Бронекостюм Периметр-5'}}).src"),/armor_char_64\.webp/);
assert.match(run("getProfileArmorVisual({armor:{name:'Экзокостюм СЭВ'}}).src"),/armor_char_15\.webp/);
for (const expression of ['{}','null',"{armor:null}","{armor:{name:'Без брони'}}", "{armor:{name:'toString'}}", "{armor:{name:'Неизвестная броня'}}"]) {
    assert.match(run(`getProfileArmorVisual(${expression}).src`),/character_portrait\.png$/);
}
assert.equal(run("getProfileArmorVisual({armor:{name:'Без брони'}}).unavailable"),false);
assert.equal(run("getProfileArmorVisual({armor:{name:'Неизвестная броня'}}).unavailable"),true);
assert.match(run("getProfileArmorVisual({armor:'Комбинезон Долг +3'}).src"),/armor_char_12\.webp/);
const otherCard = run("renderPlayerStatsCard({armor:{name:'Комбинезон Долг +3'}},'Профиль','other')");
assert.match(otherCard,/armor_char_12\.webp/);
assert.doesNotMatch(otherCard,/armor_char_1\.webp/);
assert.doesNotMatch(otherCard,/pickAndUploadAvatar/);
const ownCard = run("renderPlayerStatsCard(player,'Профиль','owner')");
assert.match(ownCard,/pickAndUploadAvatar/);
assert.ok(ownCard.indexOf('pda-profile-avatar') < ownCard.indexOf('pda-profile-armor'));
context.sample = {armor:{name:'<img src=x onerror=alert(1)> " test'}};
const malicious = run("renderProfileAppearance(sample,'https://test.invalid/avatar.jpg',false)");
assert.ok(!malicious.includes('<img src=x'));
assert.ok(malicious.includes('&quot;'));
const warning={hidden:true,textContent:''};
const img={dataset:{fallbackSrc:'default.png'},src:'armor.webp',style:{},onerror:()=>{},
    getAttribute(){return this.src;},closest(){return {querySelector(){return warning;}};}};
context.img=img;
run('handleProfileArmorError(img)');
assert.equal(img.src,'default.png');
assert.equal(warning.hidden,false);
run('handleProfileArmorError(img)');
assert.equal(img.style.display,'none');
assert.equal(img.onerror,null);
assert.ok(html.includes('object-fit:contain!important'));
assert.ok(html.includes('id="pda-profile-layout"'));
async function resolveProfile(id, armor) {
    assert.ok(pending.has(id));
    pending.get(id)({ok:true,json:()=>Promise.resolve({nickname:id,armor:{name:armor}})});
    await new Promise(resolve=>setImmediate(resolve));
}
(async()=>{
    run("showPlayerInfo('slow'); showPlayerInfo('fast');");
    await resolveProfile('fast','Комбинезон Долг');
    assert.match(content.innerHTML,/armor_char_12\.webp/);
    await resolveProfile('slow','Комбинезон Юность');
    assert.match(content.innerHTML,/armor_char_12\.webp/);
    run("showPlayerInfo('late'); openKpkTab('info');");
    await resolveProfile('late','Комбинезон Юность');
    assert.equal(content.innerHTML,'own-card');
    assert.ok(requests.every(r=>r.opts.cache==='no-store'));
    console.log(`PASS: all inline scripts compile; ${cases} armor mapping cases; own/other profiles; missing armor; escaping; image fallback; request races.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
