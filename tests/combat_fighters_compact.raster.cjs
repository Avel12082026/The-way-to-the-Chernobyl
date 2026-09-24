const assert=require('node:assert/strict'),path=require('node:path');
const f=require('../images/combat/fighters.js');
let native;
for(const name of ['@napi-rs/canvas',...(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?[path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'@napi-rs/canvas')]:[]),'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas']){
 try{native=require(name);break;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}
}
if(!native)throw Error('Local raster QA requires @napi-rs/canvas');
const {createCanvas}=native;
function image(rectangles){const canvas=createCanvas(64,800),ctx=canvas.getContext('2d');for(const [color,...rect]of rectangles){ctx.fillStyle=color;ctx.fillRect(...rect);}return canvas;}
const body=image([['#008000',0,0,32,64],['#ff8000',32,20,32,14],['#0000ff',20,20,8,14],['#0000ff',50,20,12,14]]);
const hands=image([['#ff00ff',20,20,8,14],['#00ffff',36,20,4,14],['#ff8000',48,20,16,14],['#ffff00',50,20,12,14]]);
const gun=image([['#ff0000',19,20,9,8],['#ff0000',40,36,8,8]]);
const supportArm=[[32,20],[64,20],[64,34],[32,34]];
const handMasks=[[[20,20],[28,20],[28,34],[20,34]],[[50,20],[62,20],[62,34],[50,34]]];
const canvas=createCanvas(1536,1024),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
const GREEN=[0,128,0,255],BLUE=[0,0,255,255],ORANGE=[255,128,0,255],CLEAR=[0,0,0,0],MAGENTA=[255,0,255,255],YELLOW=[255,255,0,255];
const layers={body,hands,gun,supportArm,character:{grip:[0,0],trigger:[24,24],support:[56,24],handMasks,foregroundArm:[[0,20],[64,20],[64,34],[0,34]]},weapon:{grip:[0,0],scale:1,pose:'heavy'},adjustment:{supportShift:[-16,12]}};
for(const fallback of [false,true]){
 ctx.clearRect(0,0,1536,1024);
 const subject={...layers,character:{...layers.character,handMasks:fallback?undefined:handMasks}};
 f.draw(ctx,subject,'player');f.draw(ctx,subject,'enemy');
 for(const [x,y,expected,why]of [
  [24,40,GREEN,'Torso hides translated elbow; the chest is unchanged'],
  [22,40,GREEN,'Trigger-hand crop cloth is excluded from the translated far-hand pass'],
  [33,44,ORANGE,'Original-width sleeve emerges from behind the torso'],
  [42,38,fallback?YELLOW:BLUE,'Far hand moves rigidly and covers its gun contact'],
  [24,24,fallback?MAGENTA:BLUE,'Primary hand remains at its original position'],
  [56,25,CLEAR,'Old far arm is removed from body, foreground arm and hand replays'],
  [48,40,CLEAR,'Translation preserves arm boundary without stretching']
 ]){
  assert.deepEqual(pixel(308+x,140+y),expected,why+' (player, fallback='+fallback+')');
  assert.deepEqual(pixel(1535-308-x,140+y),expected,why+' (NPC, fallback='+fallback+')');
 }
 const left=ctx.getImageData(308,140,64,80).data,right=ctx.getImageData(1164,140,64,80).data;
 for(let y=0;y<80;y++)for(let x=0;x<64;x++)for(let c=0;c<4;c++)assert.equal(left[(y*64+x)*4+c],right[(y*64+63-x)*4+c],`Compact NPC mirror at ${x},${y},${c}`);
 ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,3,3);assert.deepEqual(pixel(1,1),MAGENTA,'Compact clips and translations must not leak');
}
ctx.clearRect(0,0,1536,1024);f.draw(ctx,{...layers,character:{...layers.character,handMasks:undefined,trigger:undefined}},'player');
assert.deepEqual(pixel(330,180),[0,255,255,255],'Legacy metadata without a valid hand gap retains its existing polygon fallback');
// Valid polygons alone do not activate articulation on existing weapons.
ctx.clearRect(0,0,1536,1024);f.draw(ctx,{...layers,adjustment:{}},'player');
assert.deepEqual(pixel(364,165),BLUE,'Without supportShift the original hand remains in place');
ctx.clearRect(0,0,1536,1024);f.draw(ctx,{...layers,weapon:{...layers.weapon,pose:'pistol'}},'player');
assert.deepEqual(pixel(364,165),BLUE,'Pistol rendering ignores support-arm metadata');
ctx.clearRect(0,0,1536,1024);f.draw(ctx,{...layers,supportArm:[[24,20],[64,20],[64,34],[24,34]]},'player');
assert.deepEqual(pixel(334,164),BLUE,'Precisely traced primary fingers are restored even if a far-arm source outline overlaps them');
console.log('PASS: compact actual pixels, rigid far arm, torso/near hand preserved, no ghost arm, both mask sources, exact NPC mirror and restored clips');
