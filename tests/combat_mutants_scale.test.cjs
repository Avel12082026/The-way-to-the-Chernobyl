const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const manifest=require('../images/combat/mutants-side/manifest.js');
const validation=require('../asset_sources/mutants_side_redraw/validation.json');
const {drawCreature}=require('../images/combat/layout.js');
const fighters=require('../images/combat/fighters.js');
const fleshMetadata=require('../asset_sources/mutants_side_redraw/flesh.json');
const stronglavMetadata=require('../asset_sources/mutants_side_redraw/stronglav.json');

function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function project(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
function renderBounds(id){
 const entry=manifest.species[id],png=fs.readFileSync(path.join(root,entry.image));
 const image={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
 assert.equal(image.width,entry.contact.width,id+' contact width matches actual PNG');
 assert.equal(image.height,entry.contact.height,id+' contact height matches actual PNG');
 let matrix=[1,0,0,1,496,0],stack=[],draw;
 const ctx={save(){stack.push(matrix.slice());},restore(){matrix=stack.pop();},translate(x,y){matrix=multiply(matrix,[1,0,0,1,x,y]);},scale(x,y){matrix=multiply(matrix,[x,0,0,y,0,0]);},createRadialGradient(){return {addColorStop(){}};},fillRect(){},drawImage(im,x,y,w,h){draw={x,y,w,h,m:matrix.slice()};}};
 drawCreature(ctx,image,id,0,entry);
 const point=(x,y)=>project(draw.m,draw.x+x*draw.w/image.width,draw.y+y*draw.h/image.height);
 assert.ok(Math.abs(point(image.width/2,entry.contact.groundY)[1]-940)<1e-7,id+' stays on the player floor');
 const [l,t,r,b]=validation.species[id].visibleAlphaBBox,leftTop=point(l,t),rightBottom=point(r,b);
 assert.ok(leftTop[0]>590&&rightBottom[0]<1525,id+' remains clear of player and right frame');
 assert.ok(leftTop[1]>0&&rightBottom[1]<1024,id+' is fully inside the scene');
 assert.equal(stack.length,0);
 return {left:leftTop[0],top:leftTop[1],right:rightBottom[0],bottom:rightBottom[1],height:rightBottom[1]-leftTop[1]};
}

assert.equal(manifest.version,'mutants-side-20260925-v3');
const reference=fleshMetadata.scaleReview.referenceActor;
const gear=fighters.resolve({armorId:reference.armorId,weaponId:reference.weaponId});
const body=fs.readFileSync(path.join(root,gear.body)),bodyHeight=body.readUInt32BE(20);
const chestSceneY=940+(reference.sourceChest.y-gear.feet.groundY)*(800/bodyHeight);
const flesh=renderBounds('flesh'),dog=renderBounds('chernobyl-dog'),stronglav=renderBounds('stronglav');
assert.ok(Math.abs(flesh.top-chestSceneY)<1,'Flesh reaches the measured human sternum rather than the knees/waist');
assert.ok(dog.height>=400&&dog.height<=450,'Chernobyl dog has the approved imposing hound scale');
assert.ok(stronglav.height>=850&&stronglav.height<=900,'Upright Stronglav is substantially taller than ordinary mutants');
assert.ok(stronglav.height>=renderBounds('bloodsucker').height+200,'Stronglav remains at least200px taller than Bloodsucker');
const saved=fs.readFileSync(path.join(root,manifest.species.stronglav.image));
assert.equal(crypto.createHash('sha256').update(saved).digest('hex'),stronglavMetadata.approvedImageSHA256,'Saved Stronglav pixels match the user-approved source exactly');
console.log('PASS: Flesh reaches human chest, imposing Chernobyl dog, taller approved Stronglav, matching PNG contacts and clear scene bounds');
