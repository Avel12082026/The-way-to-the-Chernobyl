'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const html=fs.readFileSync('index.html','utf8');
const catalog=vm.runInNewContext(html.match(/const weapons = (\[[\s\S]*?\n    \]);/)[1]);
const bank=require('../audio/combat-sounds.js');
const regular=catalog.filter(w=>!w.adminOnly);
assert.equal(regular.length,116);
assert.deepEqual(Object.keys(bank.weapons).map(Number).sort((a,b)=>a-b),Array.from(regular,w=>w.id).sort((a,b)=>a-b));
assert.equal(bank.weapons[85],undefined,'The admin gaze attack is not a firearm');
const used=new Set();
for(const weapon of regular){
 const sound=bank.weapons[weapon.id];
 assert.equal(sound.name,weapon.name);
 assert.ok(Number.isFinite(sound.rate)&&sound.rate>=.75&&sound.rate<=1.2,'Plausible mapping rate: '+weapon.name);
 assert.ok(bank.profiles[sound.profile]?.files.length,'No missing sound profile: '+weapon.name);
 used.add(sound.profile);
}
assert.equal(used.size,Object.keys(bank.profiles).length,'No unused sounds should ship');
const listed=[];
for(const profile of Object.values(bank.profiles))for(const file of profile.files){
 assert.match(file,/^[a-z0-9_-]+\.mp3$/);
 const path='audio/gunshots/'+file;
 assert.ok(fs.statSync(path).size>1000,'Nonempty audio asset');listed.push(path);
}
assert.deepEqual(fs.readdirSync('audio/gunshots').map(x=>'audio/gunshots/'+x).sort(),listed.sort(),'No forgotten sound variants');
const evidence=JSON.parse(fs.readFileSync('audio/gunshot-sources.json','utf8'));
const provenanceClips=[];
function collect(value){if(!value||typeof value!=='object')return;if(value.path?.startsWith('audio/gunshots/')&&value.sha256)provenanceClips.push(value);for(const v of Object.values(value))if(typeof v==='object')collect(v);}
collect(evidence);
assert.equal(provenanceClips.length,listed.length,'Every shipped MP3 needs provenance');
for(const clip of provenanceClips)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(clip.path)).digest('hex'),clip.sha256,'Provenance hash: '+clip.path);
assert.ok(listed.reduce((sum,path)=>sum+fs.statSync(path).size,0)<1500000,'Sound bank stays compact');
const side=html.indexOf('src="images/combat/side-scene.js'),manifest=html.indexOf('src="audio/combat-sounds.js'),audio=html.indexOf('src="audio/combat-audio.js');
assert.ok(side>=0&&manifest>side&&audio>manifest,'Attach sounds after the production scene and manifest');
console.log('PASS: all116 firearms, all34 sound assets, provenance hashes and script order');
