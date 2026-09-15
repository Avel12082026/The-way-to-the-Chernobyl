const test=require('node:test'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const effects=require('../images/combat/effects.js');
test('new weapon explicit muzzle draws timed flash on transparent canvas',()=>{
 for(const ms of [0,40,89,90,150,240]){
  const c=createCanvas(300,300),ctx=c.getContext('2d');
  effects.drawShot(ctx,{shot:true},ms,4,{suppressed:false},{x:150,y:150,angle:0});
  const p=ctx.getImageData(0,0,300,300).data;
  assert.equal(p.some((v,i)=>i%4===3&&v>0),ms<90);
  assert.equal(p[3],0);assert.equal(p[p.length-1],0);
 }
});
test('unknown weapon without muzzle stays invisible',()=>{
 const c=createCanvas(100,100),ctx=c.getContext('2d');
 assert.equal(effects.drawShot(ctx,{shot:true},0,4,{suppressed:false}),false);
});
