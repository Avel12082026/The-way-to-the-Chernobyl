const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),base=path.resolve(root,'../recover/release/images/combat/fighters.js');
const data=structuredClone(require(base).data);data.version='combat-environments-flashes-v1';
const read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,p),'utf8'));
data.muzzles={};for(const suffix of ['a','b']){const file='muzzles-'+suffix+'.json';if(fs.existsSync(path.join(__dirname,file)))Object.assign(data.muzzles,read(file).weapons);}
data.feet=fs.existsSync(path.join(__dirname,'feet.json'))?read('feet.json'):{};
let source=fs.readFileSync(base,'utf8').replace(/const data=.*;\nconst base=/,'const data='+JSON.stringify(data)+';\nconst base=');
source=source.replace('body:base+',"feet:data.feet[armorId+':'+pose],muzzle:data.muzzles[weaponId],\n  body:base+");
source=source.replace('supportArm:gear.supportArm};','supportArm:gear.supportArm,feet:gear.feet,muzzle:gear.muzzle,weaponId:gear.weaponId};');
source=source.replace('function draw(ctx,layers,side,offset=0){',fs.readFileSync(path.join(__dirname,'fighter-geometry.js.txt'),'utf8')+'\nfunction draw(ctx,layers,side,offset=0){');
source=source.replace("const scale=800/body.height, x=(side==='player'?340:1196)+offset;","const position=placement(layers,side,offset),scale=position.scale,x=position.x;");
source=source.replace('ctx.translate(-body.width/2,-body.height);','ctx.translate(-body.width/2,-position.ground);');
source=source.replace('const api={resolve,load,draw,data};','const api={resolve,load,draw,muzzle,feet,project,placement,data};');
fs.writeFileSync(path.join(root,'candidate/fighters.js'),source);
console.log({muzzles:Object.keys(data.muzzles).length,feet:Object.keys(data.feet).length,version:data.version});
