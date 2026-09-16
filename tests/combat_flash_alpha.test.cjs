// Render the real effect onto a transparent canvas: alpha must vanish outside
// its radial glow and polygon, and the whole frame must clear after 90 ms.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'..'),window={},context=vm.createContext({window});
for(const f of ['layout.js','modular/data.js','modular/renderer.js','effects.js'])vm.runInContext(fs.readFileSync(path.join(root,'images/combat',f),'utf8'),context);
const out=path.join(root,'asset_sources/hand_transparency_review');fs.mkdirSync(out,{recursive:true});
const report=[];
for(const id of Object.keys(window.COMBAT_MODULAR_DATA.weapons)){
 for(const mode of ['legacy','modular']){
  const muzzle=mode==='legacy'?window.CombatEffects.getMuzzle(id):window.CombatModular.resolve(id,1).muzzle;
  for(const ms of [0,40,89,90,150,240]){
   const c=createCanvas(1536,1024),ctx=c.getContext('2d');
   const drawn=window.CombatEffects.drawShot(ctx,{shot:true},ms,id,{suppressed:false},muzzle);
   const a=ctx.getImageData(0,0,1536,1024).data;let visible=0,outside=0;
   for(let y=0;y<1024;y++)for(let x=0;x<1536;x++)if(a[(y*1536+x)*4+3]){
    visible++;if(Math.hypot(x+.5-muzzle.x,y+.5-muzzle.y)>97)outside++;
   }
   assert.equal(outside,0,`${mode} ${id} ${ms}: rectangular/background pixels`);
   assert.equal(drawn,ms<90);assert.equal(visible>0,ms<90);
   report.push({weapon:Number(id),mode,ms,visible,outside,passed:true});
  }
 }
}
fs.writeFileSync(path.join(out,'flash-alpha.json'),JSON.stringify(report,null,2));
console.log(`${report.length} actual effect renders: outside alpha zero; lifetime passed`);
