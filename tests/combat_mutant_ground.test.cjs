const assert=require('node:assert/strict');
const {layout,drawCreature}=require('../images/combat/layout.js');
let checked=0;
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function project(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];}
for(const [id,ground] of Object.entries(layout.creatureGround))for(const lunge of [0,32]){
 let m=[1,0,0,1,0,0],stack=[],shadows=[],imageDraw;
 const ctx={save(){stack.push(m.slice());},restore(){m=stack.pop();},translate(x,y){m=multiply(m,[1,0,0,1,x,y]);},scale(x,y){m=multiply(m,[x,0,0,y,0,0]);},createRadialGradient(){shadows.push(project(m,0,0));return {addColorStop(){}};},fillRect(){},drawImage(im,x,y,w,h){imageDraw={m:m.slice(),x,y,w,h};}};
 const image={width:ground.width,height:ground.height};drawCreature(ctx,image,id,lunge);
 const fit=layout.creatures[id]||layout.creature;
 const scale=Math.min(fit.width/image.width,fit.height/image.height);
 assert.equal(imageDraw.w,image.width*scale,`${id} keeps original image width`);
 assert.equal(imageDraw.h,image.height*scale,`${id} keeps original image height`);
 const sourceToScene=(x,y)=>project(imageDraw.m,imageDraw.x+x*scale,imageDraw.y+y*scale);
 if(ground.floating){assert.equal(imageDraw.y,-image.height*scale,`${id} remains floating`);assert.equal(shadows.length,1);continue;}
 assert.equal(sourceToScene(image.width/2,ground.groundY)[1],fit.y+fit.height,`${id} opaque bottom lands on assigned floor`);
 assert.equal(shadows.length,ground.feet.length);
 ground.feet.forEach((foot,i)=>{
  const p=sourceToScene(foot.x,foot.y),shadow=shadows[i];assert.ok(Math.hypot(p[0]-shadow[0],p[1]-shadow[1])<1e-7,`${id} actual canvas shadow center follows foot, also during lunge`);checked++;
 });
 assert.equal(stack.length,0);
}
assert.equal(Object.keys(layout.creatureGround).length,29);
assert.equal(Object.values(layout.creatureGround).filter(g=>g.floating).length,2);
console.log(`PASS: 27 grounded mutants, 2 floating poltergeists, ${checked} foot/shadow transforms, unchanged size and floor`);
