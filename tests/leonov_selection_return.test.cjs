'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ui/bunker-menu.js'),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
const exit=section('    window.exitScientists = function() {','    // Any legacy entry');
const leonov=section('  function openLeonov(origin = \'\') {','  function openScientistAction(mode) {');
function classes(...initial){const values=new Set(initial);return {add(...names){names.forEach(name=>values.add(name));},remove(...names){names.forEach(name=>values.delete(name));},contains(name){return values.has(name);}};}
function fixture({busy=false,staleProfile=false,cleanupChangesOrigin=false}={}){
 const calls=[],writes=[],root={id:'scientistsScreen',classList:classes('active')},hub={classList:classes()};
 const buyList={children:['buy'],replaceChildren(){this.children=[];}},sellList={children:['sell'],replaceChildren(){this.children=[];}};
 const context={busy,mode:'selection',leonovReturnOrigin:'yantar-bunker',breedSlot1:'Медуза',breedSlot2:'Искра',root,buyList,sellList,leonovScreen:hub,
  document:{body:{classList:classes()}},
  cleanup(){calls.push('cleanup');if(cleanupChangesOrigin)context.leonovReturnOrigin='cordon-camp';},
  nativeExit(){calls.push('nativeExit');context.openScreen('main');},
  openScreen(screen){calls.push(screen);if(screen==='main')writes.push({place:'cordon-camp',origin:'cordon-camp'});},
  ensureLeonovScreen(){return hub;},
  saveWorldPosition(place,origin){writes.push({place,origin});},
  openYantarCamp(){calls.push('yantar');writes.push({place:'yantar-bunker',origin:'yantar-bunker'});},
  GamePosition:{current:{zoneLocation:staleProfile?1:6,origin:staleProfile?'cordon-camp':'yantar-bunker'}}
 };
 context.window=context;vm.createContext(context);vm.runInContext(leonov+'\n'+exit,context);
 return {context,calls,writes,root,hub,buyList,sellList};
}
for(const staleProfile of [false,true])test('selection returns to Yantar without any Cordon navigation'+(staleProfile?' after a stale profile reload':''),()=>{
 const f=fixture({staleProfile});f.context.exitScientists();
 assert.equal(f.context.mode,'hub');assert.equal(f.context.breedSlot1,null);assert.equal(f.context.breedSlot2,null);
 assert.equal(f.root.id,'scientistsScreen');assert.equal(f.root.classList.contains('active'),false);
 assert.equal(f.hub.classList.contains('active'),true);assert.deepEqual(f.buyList.children,[]);assert.deepEqual(f.sellList.children,[]);
 assert.deepEqual(f.calls,['cleanup']);assert.deepEqual(f.writes,[{place:'leonov',origin:'yantar-bunker'}]);
 f.context.closeLeonov();assert.equal(f.hub.classList.contains('active'),false);assert.equal(f.calls.at(-1),'yantar');
 assert(f.writes.every(write=>write.origin==='yantar-bunker'));
});
test('exit captures its return origin before cleanup can change navigation context',()=>{
 const f=fixture({cleanupChangesOrigin:true});f.context.exitScientists();
 assert.equal(f.context.leonovReturnOrigin,'yantar-bunker');assert.deepEqual(f.writes,[{place:'leonov',origin:'yantar-bunker'}]);
});
test('an in-flight selection blocks exit without clearing parents or changing screens',()=>{
 const f=fixture({busy:true});f.context.exitScientists();
 assert.equal(f.context.mode,'selection');assert.equal(f.context.breedSlot1,'Медуза');assert.equal(f.context.breedSlot2,'Искра');
 assert.equal(f.root.classList.contains('active'),true);assert.deepEqual(f.buyList.children,['buy']);assert.deepEqual(f.sellList.children,['sell']);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.writes,[]);
});
