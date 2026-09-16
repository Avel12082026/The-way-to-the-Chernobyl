const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const listeners={},events=[],stored={};let fetchCount=0,ctx;
 class AudioContext{
  constructor(){ctx=this;this.state='suspended';this.destination={};}
  resume(){this.state='running';return Promise.resolve();}
  decodeAudioData(){return Promise.resolve({});}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
  createBufferSource(){const source={connect(){},disconnect(){},start(){events.push('start');},stop(){events.push('stop');source.onended?.();}};return source;}
 }
 const root={AudioContext,document:{hidden:false,addEventListener:(n,f)=>listeners[n]=f},addEventListener:(n,f)=>listeners[n]=f,
 localStorage:{getItem:k=>stored[k]||null,setItem:(k,v)=>stored[k]=v},fetch:async()=>{fetchCount++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(0)};}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../audio/combat/sound.js'),'utf8'),{window:root});
 return {root,api:root.CombatAudio,listeners,events,stored,get fetchCount(){return fetchCount;}};
}
test('recording preloads once and plays only when unlocked, ready and classified',async()=>{
 const x=setup();assert.equal(x.api.playShot(98,{suppressed:false}),false);
 await Promise.all([x.api.prepare(98),x.api.prepare(98)]);assert.equal(x.fetchCount,1);
 assert.equal(x.api.playShot(98,{suppressed:false}),false);x.listeners.pointerdown();
 assert.equal(x.api.playShot(98,{suppressed:false}),true);
 for(const model of [{suppressed:true},{},undefined])assert.equal(x.api.playShot(98,model),false);
 assert.equal(x.api.playShot(1,{suppressed:false}),false);await x.api.prepare(1);assert.equal(x.fetchCount,1);
});
test('muting and backgrounding stop tails and suppress new sounds',async()=>{
 const x=setup();await x.api.prepare(98);x.listeners.pointerdown();x.api.playShot(98,{suppressed:false});
 x.api.setSettings({enabled:false});assert.deepEqual(x.events,['start','stop']);assert.equal(x.api.playShot(98,{suppressed:false}),false);
 x.api.setSettings({enabled:true,volume:4});assert.equal(x.api.getSettings().volume,1);
 x.api.playShot(98,{suppressed:false});x.root.document.hidden=true;x.listeners.visibilitychange();assert.equal(x.events.at(-1),'stop');
 assert.equal(x.api.playShot(98,{suppressed:false}),false);
 assert.equal(JSON.parse(x.stored['zone.combatSound']).volume,1);
});
test('polyphony is bounded and settings changes do not replay old shots',async()=>{
 const x=setup();await x.api.prepare(98);x.listeners.keydown();for(let i=0;i<6;i++)x.api.playShot(98,{suppressed:false});
 assert.equal(x.events.filter(e=>e==='start').length,6);assert.equal(x.events.filter(e=>e==='stop').length,2);
 x.api.setSettings({volume:0});assert.equal(x.events.filter(e=>e==='stop').length,6);assert.equal(x.api.playShot(98,{suppressed:false}),false);
});
