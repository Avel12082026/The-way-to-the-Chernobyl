'use strict';
// Deterministic image events and fake timers; no API calls or real player changes.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const block = re => { const m=html.match(re); assert.ok(m,`Missing ${re}`); return m[0]; };
const fn = name => block(new RegExp('^    function '+name+'\\([^]*?^    }','m'));
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/\bsrc\s*=/.test(m[1])) new vm.Script(m[2]);
}
function setup() {
    const span={textContent:''}, button={hidden:true};
    const status={hidden:true,querySelector:s=>s==='span'?span:button};
    const timers=new Map(); let sequence=0,now=0;
    const image={isConnected:true,complete:true,naturalWidth:0,style:{},requests:[],_src:null,
        getAttribute(){return this._src;},get src(){return this._src;},
        set src(value){this._src=value;this.requests.push(value);this.complete=false;this.naturalWidth=0;},
        success(){this.complete=true;this.naturalWidth=512;this.onload?.();},
        failure(){this.complete=true;this.naturalWidth=0;this.onerror?.();}};
    const context=vm.createContext({console,Date,SERVER_URL:'https://assets.test',
        DEFAULT_ARMOR:{name:'Без брони'},DEFAULT_CHARACTER_PORTRAIT:'character_portrait.png',
        player:{armor:{name:'Комбинезон Юность'}},
        document:{getElementById:id=>id==='characterPortraitImg'?image:id==='characterPortraitStatus'?status:null},
        setTimeout:(cb,ms)=>{const id=++sequence;timers.set(id,{cb,time:now+ms});return id;},
        clearTimeout:id=>timers.delete(id)});
    vm.runInContext([
        block(/    const ARMOR_CHAR_IMAGES = \{[\s\S]*?\n    \};/),
        block(/    const CLIENT_ICON_VERSIONS = new Map\(\[[\s\S]*?\n    \]\);/),
        'let characterPortraitRequest = null;',
        ...['stripInvisibleSuffix','parseGearName','getIconUrl','getProfileArmorVisual',
            'setCharacterPortraitStatus','updateCharacterPortrait'].map(fn)
    ].join('\n'),context);
    return {image,status,span,button,context,timers,run:s=>vm.runInContext(s,context),
        tick(ms){const end=now+ms;let cycles=0;while(true){
            const next=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];
            if(!next)break;assert.ok(++cycles<50,'timer loop');
            now=next[1].time;timers.delete(next[0]);next[1].cb();
        }now=end;}};
}
let passed=0;
function test(name,cb){cb(setup());passed++;console.log('PASS:',name);}
test('loaded portrait survives repeated inventory renders without new requests',t=>{
    t.run('updateCharacterPortrait()');t.image.success();
    for(let i=0;i<20;i++)t.run('updateCharacterPortrait()');
    assert.equal(t.image.requests.length,1);assert.equal(t.status.hidden,true);assert.equal(t.timers.size,0);
    t.image.style.display='none';t.image.style.visibility='hidden';t.run('updateCharacterPortrait()');
    assert.equal(t.image.style.display,'');assert.equal(t.image.style.visibility,'');
});
test('one transient failure automatically retries exact equipped armor',t=>{
    t.run('updateCharacterPortrait()');t.image.failure();
    for(let i=0;i<10;i++)t.run('updateCharacterPortrait(false)');
    t.tick(750);assert.equal(t.image.requests.length,2);
    assert.match(t.image.src,/armor_char_1\.webp\?v=195c8766b2fc&portrait_retry=/);
    t.image.success();assert.equal(t.image.style.visibility,'');assert.equal(t.status.hidden,true);
    t.tick(60000);assert.equal(t.image.requests.length,2);
});
test('failed primary and retry use only one labelled fallback',t=>{
    t.run('updateCharacterPortrait()');t.image.failure();t.tick(750);t.image.failure();
    assert.match(t.image.src,/character_portrait\.png$/);t.image.success();
    assert.match(t.span.textContent,/запасной портрет/);assert.equal(t.button.hidden,false);
    for(let i=0;i<10;i++)t.run('updateCharacterPortrait(false)');
    assert.equal(t.image.requests.length,3);
});
test('all failures stop, keep equipment and offer recovery on reopen',t=>{
    t.run('updateCharacterPortrait()');t.image.failure();t.tick(750);t.image.failure();t.image.failure();
    assert.equal(t.image.requests.length,3);assert.equal(t.timers.size,0);assert.equal(t.button.hidden,false);
    assert.match(t.span.textContent,/Не удалось/);assert.equal(t.run('player.armor.name'),'Комбинезон Юность');
    t.tick(120000);t.run('updateCharacterPortrait(false)');assert.equal(t.image.requests.length,3);
    t.run('updateCharacterPortrait(true)');assert.match(t.image.src,/armor_char_1/);
    t.image.success();assert.equal(t.image.style.visibility,'');assert.equal(t.status.hidden,true);
});
test('stalled requests time out with no infinite retry',t=>{
    t.run('updateCharacterPortrait()');t.tick(8000+750+8000+8000);
    assert.equal(t.image.requests.length,3);assert.equal(t.timers.size,0);assert.equal(t.button.hidden,false);
});
test('late success during retry wait cancels retry',t=>{
    t.run('updateCharacterPortrait()');t.image.failure();t.image.success();t.tick(9000);
    assert.equal(t.image.requests.length,1);assert.equal(t.timers.size,0);
});
test('armor change invalidates old timers and stale callbacks',t=>{
    t.run('updateCharacterPortrait()');const oldLoad=t.image.onload,oldError=t.image.onerror;t.image.failure();
    t.run("player.armor={name:'Комбинезон Долг +3\\u200B'};updateCharacterPortrait(false)");
    assert.match(t.image.src,/armor_char_12\.webp/);t.image.success();oldLoad();oldError();t.tick(10000);
    assert.equal(t.image.requests.length,2);assert.match(t.image.src,/armor_char_12\.webp/);
});
test('detached image never retries',t=>{
    t.run('updateCharacterPortrait()');t.image.failure();t.image.isConnected=false;t.tick(9000);
    assert.equal(t.image.requests.length,1);
});
test('missing armor does not throw or repeatedly request identical fallback',t=>{
    for(const armor of [null,{},'Без брони',{name:'toString'}]) {
        t.context.player.armor=armor;t.run('updateCharacterPortrait(true)');
        t.image.failure();t.tick(750);t.image.failure();
        assert.match(t.image.src,/character_portrait\.png/);assert.equal(t.timers.size,0);
    }
    assert.equal(t.image.requests.length,8);
});
test('all 96 armor mappings retain upgraded and duplicate item routing',t=>{
    const map=JSON.parse(t.run('JSON.stringify(ARMOR_CHAR_IMAGES)'));
    assert.equal(Object.keys(map).length,96);
    for(const [name,file]of Object.entries(map)) {
        t.context.player.armor={name:name+' +9\u200B\u200C'};t.run('updateCharacterPortrait()');
        assert.equal(t.image.src.split('?')[0].split('/').pop(),file);t.image.success();
    }
});
assert.match(html,/window\.addEventListener\('online', \(\) => updateCharacterPortrait\(true\)\)/);
assert.match(html,/function updateUI\(\) \{\s*sanitizePlayerNumbers\(\);\s*updateCharacterPortrait\(false\)/);
assert.match(html,/onclick="updateCharacterPortrait\(true\)"/);
console.log(`PASS: ${passed} recovery scenarios, 96 live client mappings, all inline scripts compile.`);
