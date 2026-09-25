'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const combat=fs.existsSync(path.join(root,'environments-v2.js'))?root:path.join(root,'images/combat');
const environments=require(path.join(combat,'environments-v2.js'));
const source=fs.readFileSync(path.join(root,'ui/raid-kpk-polish.js'),'utf8');
assert(!source.includes('images/combat/backgrounds/'),'Deleted legacy PNGs must never load');
const snippet=source.slice(source.indexOf('let raidIdleBackgroundIndex='),source.indexOf('let raidBalanceFrame='));
assert(snippet.includes('function paintRaidIdleBackground'));
const callbacks=[];
const context={window:{CombatEnvironments:environments,ZoneMap:{location:1}},MutationObserver:class{constructor(callback){callbacks.push(callback);}observe(){}disconnect(){}}};
vm.runInNewContext(snippet+'\nthis.idleTest={paintRaidIdleBackground,observeRaidLogForBackground};',context);
let writes=0;
const attrs={};
const idle={getAttribute:key=>attrs[key],setAttribute(key,value){attrs[key]=value;writes++;}};
const {paintRaidIdleBackground:paint,observeRaidLogForBackground:observe}=context.idleTest;
observe({}, {}, idle);
const onLogChanged=callbacks[0];
const id=()=>Number(attrs.src.match(/environments\/(\d+)\.webp/)[1]);
for(const zoneLocation of [1,2,3,4,1]){
 context.window.ZoneMap.location=zoneLocation;
 paint(idle);
 const oldWrites=writes;paint(idle);
 assert.equal(writes,oldWrites,'Repeating layout does not redownload the idle image');
 const seen=new Set();
 for(let i=0;i<100;i++){
  onLogChanged();
  seen.add(id());
  assert.ok(id()>(zoneLocation-1)*5&&id()<=zoneLocation*5,'Idle scenery stays inside the current location');
  assert.equal(idle.hidden,false);
  assert.ok(idle.alt.startsWith(environments.zones[zoneLocation-1].label));
 }
 assert.equal(seen.size,5,'All five location-specific views are reachable while exploring');
}
delete context.window.ZoneMap;
context.window.__zoneLocation=3;paint(idle);assert.ok(id()>=11&&id()<=15);
delete context.window.__zoneLocation;
context.window.GamePosition={current:{zoneLocation:4}};paint(idle);assert.ok(id()>=16&&id()<=20);
delete context.window.GamePosition;paint(idle);assert.ok(id()>=1&&id()<=5);
delete context.window.CombatEnvironments;paint(idle);assert.equal(id(),1);assert.equal(idle.alt,'Кордон');
console.log('PASS: idle backgrounds follow current location and transitions, reuse images, and never load removed PNGs');
