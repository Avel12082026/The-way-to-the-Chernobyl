const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const patch=JSON.parse(fs.readFileSync('server_patches/inventory_drag.json','utf8'));
let handler,data;const defs={new:{stats:{health:10}},old:{stats:{health:20}}};
const ctx={app:{get(){},post:(path,...args)=>handler=args.at(-1)},requireAuth(){},rateLimit:()=>()=>{},ADMIN_ID:'admin',console,Date,serverArtifactDef:n=>defs[n],safeParsePlayerData:JSON.parse,serverRecomputeArtifactDerived(){},serverEquipmentState:d=>d,pveAddItem:(d,n)=>d.inventory[n]=(d.inventory[n]||0)+1,serverApplyArtifactCapacityDelta:(d,stats)=>{d.maxHealth+=stats.health||0;d.health=Math.min(d.health,d.maxHealth)},db:{transaction:f=>f,prepare:sql=>({get:()=>({data:JSON.stringify(data)}),run:s=>data=JSON.parse(s)})}};
vm.runInNewContext(patch.replacements[0].new,ctx);
function call(index){let out;handler({telegramUser:{id:'user'},body:{itemName:'new',...(index===undefined?{}:{index})}},{json:x=>out=x,status(){return this}});return out}
function reset(){data={inventory:{new:1},artifactSlots:[null,null,null,null,null,null],maxHealth:100,health:95}}
reset();assert(call(5).success);assert.equal(data.artifactSlots[5],'new');assert.equal(data.artifactSlots[0],null);assert(!data.inventory.new);
reset();data.artifactSlots[2]='old';data.maxHealth=120;data.health=115;assert(call(2).success);assert.equal(data.artifactSlots[2],'new');assert.equal(data.inventory.old,1);assert.equal(data.maxHealth,110);assert.equal(data.health,110);
for(const bad of [-1,6,1.5,'2',null]){reset();const before=JSON.stringify(data);assert.equal(call(bad).success,false);assert.equal(JSON.stringify(data),before)}
reset();data.inventory={};assert.equal(call(0).success,false);
reset();data.artifactSlots[0]='old';assert(call().success);assert.equal(data.artifactSlots[1],'new','old client keeps first-free behavior');
console.log('PASS: exact artifact index, occupied replacement, stat delta, invalid indices and ownership');
