const {test}=require('node:test'),assert=require('node:assert/strict');
const {shouldFlash}=require('../images/combat/effects.js');
test('flash only during the first 90ms of a confirmed shot',()=>{assert.equal(shouldFlash({shot:true},0,1),true);assert.equal(shouldFlash({shot:true},89,1),true);for(const elapsed of [-1,90,500])assert.equal(shouldFlash({shot:true},elapsed,1),false);});
test('no flash for other actions, no reaction, or uncalibrated weapon',()=>{assert.equal(shouldFlash({shot:false},20,1),false);assert.equal(shouldFlash(null,20,1),false);assert.equal(shouldFlash({shot:true},20,999),false);});
const {effectKind,drawShot}=require('../images/combat/effects.js');
test('suppressed model uses smoke without any flash',()=>{for(const elapsed of [0,50,100,649])assert.equal(effectKind({shot:true},elapsed,{suppressed:true}),'smoke');assert.equal(effectKind({shot:true},650,{suppressed:true}),null);});
test('unknown model classification and non-shot actions produce no effect',()=>{assert.equal(effectKind({shot:true},10,{}),null);assert.equal(effectKind({shot:false},10,{suppressed:true}),null);assert.equal(effectKind(null,10,{suppressed:true}),null);});
test('smoke uses normal compositing, never additive flash',()=>{const modes=[];const ctx={save(){},restore(){},createRadialGradient(){return {addColorStop(){}}},fillRect(){},set globalCompositeOperation(v){modes.push(v)}};assert.equal(drawShot(ctx,{shot:true},40,1,{suppressed:true}),true);assert.deepEqual(modes,['source-over']);});
test('catalog sources agree on every reviewed pistol classification',()=>{const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const directory=path.join(__dirname,'../images/combat');const data=JSON.parse(fs.readFileSync(path.join(directory,'catalog.json'))),context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(directory,'catalog.js'),'utf8'),context);assert.equal(data.pistols.length,26);for(const w of data.pistols){assert.equal(w.suppressed,false);assert.equal(context.window.COMBAT_ASSETS.pistols.find(x=>x.id===w.id).suppressed,w.suppressed);}});

const {getMuzzle,sourceMuzzles}=require('../images/combat/effects.js');
test('every catalog pistol has a barrel anchor within its source and canvas',()=>{
 const catalog=require('../images/combat/catalog.json');
 for(const weapon of catalog.pistols){
  const [x,y,,width=1254,height=1254]=sourceMuzzles[weapon.id];
  assert.ok(x>=0&&x<width&&y>=0&&y<height,weapon.name);
  const point=getMuzzle(weapon.id);
  assert.ok(point.x>0&&point.x<1536&&point.y>0&&point.y<1024,weapon.name);
  assert.equal(shouldFlash({shot:true},40,weapon.id),true,weapon.name);
 }
});
test('barrel placement follows layout changes including non-square scaling',()=>{
 const point=getMuzzle(1,{pistols:{1:{x:10,y:20,width:1254,height:627}}});
 assert.equal(point.x,564);assert.equal(point.y,273.5);
 assert.ok(Math.abs(point.angle-Math.atan2(Math.sin(-2.65)*.5,Math.cos(-2.65)))<1e-12);
 assert.equal(getMuzzle(999),null);assert.equal(getMuzzle(1,{pistols:{}}),null);
});
