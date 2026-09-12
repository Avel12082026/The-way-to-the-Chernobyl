const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('inventory/drag.js','utf8');
class El{
 constructor(){this.style={};this.dataset={};this.children=[];this.classes=new Set();this.classList={add:(...xs)=>xs.forEach(x=>this.classes.add(x)),remove:(...xs)=>xs.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x),toggle:(x,b)=>b?this.classes.add(x):this.classes.delete(x)};this.events={};this.scrollTop=0;this.innerHTML='';this.parentElement=null;}
 setAttribute(){} removeAttribute(){} before(){} append(){} remove(){} getBoundingClientRect(){return{top:0,bottom:800}}
 addEventListener(n,cb){this.events[n]=cb} querySelectorAll(s){return s==='img,a'?[]:targets} closest(s){if(s==='#inventoryScreen,#warehouseScreen')return this.owner||ids.inventoryScreen;return s.includes('data-drag-item')?(this.dataset.dragItem?this:null):this.dataset.dropKind?this:null}
}
const ids={};for(const id of ['inventoryScreen','inventoryGrid','quickSlotsGrid','artifactSlotsGrid','inventoryDragHint','warehouseScreen','warehouseGrid','warehouseInventoryGrid','warehouseDragHint'])ids[id]=new El();
ids.inventoryScreen.id='inventoryScreen';ids.warehouseScreen.id='warehouseScreen';ids.inventoryScreen.classes.add('active');ids.inventoryGrid.children=Array.from({length:6},()=>new El());ids.quickSlotsGrid.children=Array.from({length:7},()=>new El());ids.artifactSlotsGrid.children=Array.from({length:6},()=>new El());
const targets=[...ids.quickSlotsGrid.children,...ids.artifactSlotsGrid.children],body=new El(),events={},calls=[],timers=new Map();let timerId=0,point=null,resolveRequest,delay=false,fail=false;
const player={warehouse:{stored:2},inventory:{gun:1,armor:1,detector:1,artifact:1,medkit:3,loot:1},artifactSlots:[null,null,null,null,null,null],quickSlots:[null,null,null,null]};
const document={readyState:'complete',body,scrollingElement:body,hidden:false,getElementById:id=>ids[id],createElement:()=>new El(),elementFromPoint:()=>point,addEventListener:(n,cb)=>events[n]=cb};
for(const el of ids.inventoryGrid.children)el.parentElement=body;
const ctx={document,window:{addEventListener(){},Telegram:{WebApp:{initData:'test'}}},player,raidActive:false,inventoryOpenedFromRaid:false,warehouseTransfer:async(direction,name,qty)=>{calls.push({direction,name,qty});return true},currentEnemy:null,isFriendlyEncounterActive:false,consumables:[{name:'medkit'}],getEquipSlotType:n=>({gun:'weapon',armor:'armor',detector:'detector'}[n]),findArtifactDef:n=>n==='artifact'?{}:null,getComputedStyle:()=>({overflowY:'auto'}),MutationObserver:class{observe(){}},innerHeight:800,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:cb=>{timers.set(++timerId,cb);return timerId},clearTimeout:id=>timers.delete(id),Date,console,SERVER_URL:'http://test',waitForSaveQueue:async()=>{},equipItem:async n=>{calls.push({gear:n});return true},applyEquipmentServerState:s=>calls.push({state:s}),renderInventory(){},renderQuickSlots(){},fetch:async(url,opts)=>{
 if(!opts)return{ok:true,json:async()=>({artifactSlotTarget:true})};calls.push({url,...JSON.parse(opts.body)});if(delay)await new Promise(r=>resolveRequest=r);if(fail)throw Error('offline');return{json:async()=>({success:true,state:{},quickSlots:['medkit',null,null,null]})};}};
vm.createContext(ctx);vm.runInContext(code,ctx);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const down=(i,touch=false)=>events.pointerdown({target:ids.inventoryGrid.children[i],pointerId:1,button:0,isPrimary:true,pointerType:touch?'touch':'mouse',clientX:100,clientY:500});
const move=(y=200)=>events.pointermove({pointerId:1,clientX:110,clientY:y,preventDefault(){}});
const up=()=>events.pointerup({pointerId:1,clientX:110,clientY:200});
(async()=>{
 await flush();assert(ids.inventoryGrid.children[5].dataset.dragItem);
 down(0);point=targets[0];move();up();await flush();assert.equal(calls[0].gear,'gun');
 let blocked=false;events.click({target:ids.inventoryGrid.children[0],preventDefault(){blocked=true},stopImmediatePropagation(){}});assert(blocked,'drag must not open click menu');
 let n=calls.length;down(0);point=targets[1];move();up();await flush();assert.equal(calls.length,n,'incompatible drop');
 down(4);point=targets[6];move();up();await flush();assert.equal(calls.at(-1).index,3);assert.equal(calls.at(-1).itemName,'medkit');
 down(3);point=targets[12];move();up();await flush();assert.equal(calls.findLast(c=>c.itemName==='artifact').index,5,'exact artifact target');
 n=calls.length;down(1);move();point=null;up();await flush();assert.equal(calls.length,n,'outside cancels');
 down(1);move();events.pointercancel();up();await flush();assert.equal(calls.length,n,'pointercancel cancels');
 down(1,true);point=targets[1];for(const cb of [...timers.values()])cb();move();up();await flush();assert.equal(calls.at(-1).gear,'armor','touch hold');
 n=calls.length;down(1,true);move(450);up();await flush();assert.equal(calls.length,n,'touch swipe scrolls');assert.equal(body.scrollTop,50);
 n=calls.length;ctx.currentEnemy={};down(4);point=targets[3];move();up();await flush();assert.equal(calls.length,n,'combat quick assignment blocked');ctx.currentEnemy=null;
 delay=true;down(4);point=targets[3];move();up();await flush();n=calls.length;down(4);move();up();await flush();assert.equal(calls.length,n,'pending request blocks repeats');resolveRequest();delay=false;await flush();
 const deposit=ids.warehouseGrid;deposit.dataset.dropKind='deposit';down(5);point=deposit;move();up();await flush();assert.equal(calls.at(-1).direction,'deposit');assert.equal(calls.at(-1).qty,1);
 ctx.raidActive=true;n=calls.length;down(5);move();up();await flush();assert.equal(calls.length,n,'warehouse unavailable in raid');ctx.raidActive=false;
 const stored=new El();stored.dataset.dragItem='stored';stored.dataset.dragFrom='warehouse';stored.parentElement=body;stored.owner=ids.warehouseScreen;ids.warehouseScreen.classes.add('active');
 events.pointerdown({target:stored,pointerId:1,button:0,isPrimary:true,pointerType:'mouse',clientX:100,clientY:500});point=ids.warehouseInventoryGrid;point.dataset.dropKind='withdraw';move();up();await flush();assert.equal(calls.at(-1).direction,'withdraw');assert.equal(calls.at(-1).name,'stored');
 point=targets[3];
 fail=true;down(4);move();up();await flush();assert.match(ids.inventoryDragHint.textContent,/Ошибка соединения/);
 console.log('PASS: mouse/touch, exact slot, mismatch, cancellation, swipe, combat, duplicate and network handling');
})().catch(e=>{console.error(e);process.exitCode=1});
