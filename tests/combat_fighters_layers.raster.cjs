// Local raster QA; production renderer and its portable tests have no canvas dependency.
const assert = require('node:assert/strict');
const path = require('node:path');
const f = require('../images/combat/fighters.js');
let nativeCanvas;
const candidates = [
  '@napi-rs/canvas',
  ...(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? [path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, '@napi-rs/canvas')] : []),
  '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas'
];
for (const name of candidates) {
  try { nativeCanvas = require(name); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!nativeCanvas) throw Error('Local raster QA requires @napi-rs/canvas (set CODEX_PRIMARY_RUNTIME_NODE_MODULES).');
const { createCanvas } = nativeCanvas;
function picture(color, rect) {
  const canvas = createCanvas(64, 800), ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(...rect);
  return canvas;
}
const body = picture('#008000', [0,0,64,64]);
body.getContext('2d').fillStyle='#0000ff';
body.getContext('2d').fillRect(8,8,48,20);
// Deliberately unlike body: masked hands must restore the original body image,
// whose fingers can extend beyond a previously cropped foreground bitmap.
const hands = picture('#ff00ff', [8,8,48,32]);
const gun = picture('#ff0000', [0,0,64,64]);
const layers = {
  body, hands, gun,
  character: {
    grip: [0,0],
    foregroundArm: [[4,30],[14,30],[14,40],[4,40]],
    handMasks: [ [[10,10],[20,10],[20,20],[10,20]], [[40,10],[50,10],[50,20],[40,20]] ]
  },
  weapon: { grip: [0,0], scale: 1, pose: 'heavy' }
};
const canvas = createCanvas(1536, 1024), ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
f.draw(ctx, layers, 'player');
f.draw(ctx, layers, 'enemy');
const color = (x,y) => [...ctx.getImageData(x,y,1,1).data];
const RED = [255,0,0,255], GREEN = [0,128,0,255], BLUE = [0,0,255,255], MAGENTA = [255,0,255,255];
for (const [x,y,expected,why] of [
  [5,5,RED,'Weapon covers the far body'],
  [25,15,RED,'Torso pixels from the rectangular hand crop do not bury the receiver'],
  [15,15,BLUE,'Trigger fingers cover the gun inside the first hand outline'],
  [45,15,BLUE,'Support fingers cover the gun inside the second hand outline'],
  [9,35,GREEN,'Near forearm covers the stock'],
  [20,35,RED,'Forearm clip does not cover adjacent receiver'],
  [60,60,RED,'Clip is restored before the next fighter']
]) {
  // Body pixels map one-to-one here: body.height=800 => display scale=1.
  const px=308+x, py=140+y;
  assert.deepEqual(color(px,py), expected, why+' (player)');
  assert.deepEqual(color(1535-px,py), expected, why+' (NPC)');
}
// Compare the entire rendered crop, including antialiased polygon boundaries.
const left=ctx.getImageData(308,140,64,64).data;
const right=ctx.getImageData(1164,140,64,64).data;
for(let y=0;y<64;y++)for(let x=0;x<64;x++)for(let c=0;c<4;c++) {
  assert.equal(left[(y*64+x)*4+c],right[(y*64+63-x)*4+c],`NPC mirror differs at ${x},${y}, channel ${c}`);
}
ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,3,3);
assert.deepEqual(color(1,1),[255,0,255,255],'Hand/body clips must not leak outside draw()');

// Missing masks preserve old full-hand compatibility. Empty masks suppress that overlay.
ctx.clearRect(0,0,1536,1024);
const noMaskCharacter={grip:[0,0]};
f.draw(ctx,{...layers,character:noMaskCharacter},'player');
assert.deepEqual(color(333,155),MAGENTA,'Absent handMasks retains the existing whole overlay');
ctx.clearRect(0,0,1536,1024);
f.draw(ctx,{...layers,character:{...noMaskCharacter,handMasks:[]}},'player');
assert.deepEqual(color(333,155),RED,'Empty handMasks leaves the gun in front of the far hand');

// Pistol pair offsets also use body coordinates, in both orientations.
ctx.clearRect(0,0,1536,1024);
const pistol={...layers,character:{grip:[0,0],handMasks:[]},weapon:{grip:[0,0],scale:1},adjustment:{dx:6,dy:4,size:50}};
f.draw(ctx,pistol,'player');f.draw(ctx,pistol,'enemy');
assert.deepEqual(color(313,144),GREEN,'Pistol starts after the +6 source-pixel offset');
assert.deepEqual(color(314,144),RED,'Pistol offset is applied before drawing');
assert.deepEqual(color(346,144),GREEN,'Pistol size=50 halves the 64-pixel sprite');
assert.deepEqual(color(1535-314,144),RED,'NPC mirrors the same pistol fit');

// A gun-local trigger guard can sit in front of a finger without redrawing the
// grip or filling the transparent hole. Rotation/scale/offset apply identically.
ctx.clearRect(0,0,1536,1024);
const guardBody=picture('#0000ff',[0,0,64,100]);
const guardGun=picture('#ff0000',[0,0,64,64]);
guardGun.getContext('2d').clearRect(18,18,8,8);
const guardLayers={
  body:guardBody,hands,gun:guardGun,
  character:{grip:[50,15],handMasks:[[[0,0],[64,0],[64,100],[0,100]]]},
  weapon:{grip:[4,5],scale:1,foregroundGuard:[12,12,24,24]},
  adjustment:{dx:3,dy:4,size:150,angle:90}
};
f.draw(ctx,guardLayers,'player');f.draw(ctx,guardLayers,'enemy');
for(const [x,y,expected,why] of [
  [28,34,RED,'Metal guard is drawn in front of the index finger'],
  [28,47,BLUE,'Transparent guard hole preserves the finger underneath'],
  [28,25,BLUE,'Gun outside the guard rectangle stays behind the fingers']
]){
  assert.deepEqual(color(308+x,140+y),expected,why+' (player)');
  assert.deepEqual(color(1535-308-x,140+y),expected,why+' (NPC)');
}
ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,3,3);
assert.deepEqual(color(1,1),MAGENTA,'Guard clip and gun transform must be restored');
console.log('PASS: real pixels for hand/forearm/guard layers, guard transparency, exact NPC reflection, clip restoration and pistol offsets');
