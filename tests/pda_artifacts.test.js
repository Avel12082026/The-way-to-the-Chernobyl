'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const fn=name=>{const m=html.match(new RegExp('^    function '+name+'\\([^]*?^    }','m'));assert.ok(m,name);return m[0];};
const nodes={};
for(const id of ['profileItemTitle','profileItemBody','profileItemModal','profileItemClose'])nodes[id]={textContent:'',innerHTML:'',focus(){this.focused=true;},classList:{add(){this.active=true;},remove(){this.active=false;}}};
let received;
const ctx=vm.createContext({console,encodeURIComponent,decodeURIComponent,
 escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 stripInvisibleSuffix:s=>s.replace(/[\u200b\u200c]/g,''),getItemIcon:n=>n==='Артефакт другого'?'other.png':null,getIconUrl:f=>'https://test.invalid/'+f,
 DEFAULT_WEAPON:{name:'Кулаки'},DEFAULT_ARMOR:{name:'Без брони'},DEFAULT_DETECTOR:{name:'Без детектора'},
 parseGearName:n=>({level:n.includes('+3')?3:0}),
 getItemInfoHtmlInner:(name,data)=>{received={name,data};return '<p>Описание</p>';},
 document:{getElementById:id=>nodes[id]},player:{artifactSlots:['Мой артефакт'],armorUpgradeData:{private:99}}});
vm.runInContext(['profileItemAttributes','renderProfileArtifacts','showProfileItemInfo','closeProfileItemInfo'].map(fn).join('\n'),ctx);
const run=s=>vm.runInContext(s,ctx);
ctx.sample={artifactSlots:[null,'Артефакт другого',null,null,null,null]};
let rendered=run('renderProfileArtifacts(sample)');
assert.equal((rendered.match(/data-slot-type="artifact"/g)||[]).length,6);
assert.equal((rendered.match(/<img /g)||[]).length,1);
assert.match(rendered,/other.png/);assert.doesNotMatch(rendered,/Мой артефакт/);
assert.equal((rendered.match(/Пустой слот/g)||[]).length,5);
ctx.sample={artifactSlots:[]};assert.equal((run('renderProfileArtifacts(sample)').match(/Пустой слот/g)||[]).length,6);
ctx.sample={};assert.equal((run('renderProfileArtifacts(sample)').match(/>Нет данных</g)||[]).length,6);
ctx.sample={artifactSlots:['\"\'><img src=x onerror=alert(1)>']};rendered=run('renderProfileArtifacts(sample)');assert.doesNotMatch(rendered,/<img src=x/);
ctx.sample={armor:{name:'Чужая броня +3\u200b'},armorUpgradeData:{equipped:{armor:3}}};
const attributes=run("profileItemAttributes(sample,'armor')");
ctx.button={dataset:{profileItem:attributes.match(/data-profile-item="([^"]+)"/)[1]},isConnected:true,focus(){this.focused=true;}};
run('showProfileItemInfo(button)');assert.equal(received.name,'Чужая броня +3\u200b');assert.equal(received.data.armorUpgradeData.equipped.armor,3);assert.equal(received.data.armorUpgradeData.private,undefined);
assert.equal(nodes.profileItemTitle.textContent,'Чужая броня +3');assert.ok(nodes.profileItemClose.focused);
run('closeProfileItemInfo()');assert.ok(ctx.button.focused);assert.equal(nodes.profileItemModal.classList.active,false);
ctx.button.dataset.profileItem=encodeURIComponent(JSON.stringify({slotType:'artifact',item:null}));run('showProfileItemInfo(button)');assert.match(nodes.profileItemBody.innerHTML,/ничего не надето/);
ctx.button.dataset.profileItem=encodeURIComponent(JSON.stringify({slotType:'artifact',item:null,unavailable:true}));run('showProfileItemInfo(button)');assert.doesNotMatch(nodes.profileItemBody.innerHTML,/ничего не надето/);
assert.doesNotMatch(fn('renderPlayerStatsCard'),/renderEquipmentDetails|<b>Экипировка/);
assert.doesNotMatch(fn('renderProfileEquipment'),/<figcaption/);
assert.doesNotMatch(fn('renderProfileAppearance'),/<figcaption/);
console.log('PASS: six ordered slots, empty vs unavailable, viewed-player isolation, escaped names, armor upgrade context, modal close/focus, no equipment prose');
