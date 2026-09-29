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
const burstCounts={};
for(const weapon of regular){
 const sound=bank.weapons[weapon.id];
 assert.equal(sound.name,weapon.name);
 assert.ok(Number.isFinite(sound.rate)&&sound.rate>=.75&&sound.rate<=1.2,'Plausible mapping rate: '+weapon.name);
 assert.ok(bank.profiles[sound.profile]?.files.length,'No missing sound profile: '+weapon.name);
 assert.deepEqual(Object.keys(sound.burst).sort(),['intervalMs','shots'],'Explicit presentation burst: '+weapon.name);
 assert.ok([2,3,6].includes(sound.burst.shots),'Supported pulse count: '+weapon.name);
 assert.ok([100,180,260,350].includes(sound.burst.intervalMs),'Supported pulse spacing: '+weapon.name);
 assert.ok((sound.burst.shots-1)*sound.burst.intervalMs<1000,'Burst must finish promptly: '+weapon.name);
 const key=sound.burst.shots+'@'+sound.burst.intervalMs;
 burstCounts[key]=(burstCounts[key]||0)+1;
 used.add(sound.profile);
}
assert.deepEqual(burstCounts,{'3@180':26,'2@260':1,'3@100':19,'3@260':30,'2@350':29,'6@100':11},'All gameplay classes retain their requested burst sizes');
const expectedMachineGuns=[17,67,25,61,59,71,77,22,29,53,65];
assert.deepEqual(Object.keys(bank.weapons).filter(id=>bank.weapons[id].burst.shots===6).map(Number).sort((a,b)=>a-b),expectedMachineGuns.sort((a,b)=>a-b),'Every machine gun has six pulses');
for(const weapon of regular.filter(w=>w.name.startsWith('Винтовка ')))assert.deepEqual(bank.weapons[weapon.id].burst,{shots:2,intervalMs:350},'Two rifle pulses: '+weapon.name);
for(const weapon of regular.filter(w=>w.name.startsWith('Дробовик ')))assert.deepEqual(bank.weapons[weapon.id].burst,{shots:3,intervalMs:260},'Three repeating shotgun pulses: '+weapon.name);
for(const [id,shots,intervalMs] of [[4,2,260],[7,3,180],[8,3,100],[9,3,100],[10,3,260],[16,3,100],[55,2,350],[73,2,350]])assert.deepEqual(bank.weapons[id].burst,{shots,intervalMs},'Gameplay class exception: '+bank.weapons[id].name);
// Shared source recordings must not force different gameplay classes into one cadence.
for(const [first,second] of [[11,17],[13,22],[18,30],[4,10],[16,25]]){
 assert.equal(bank.weapons[first].profile,bank.weapons[second].profile,'Fixture shares a source family');
 assert.notDeepEqual(bank.weapons[first].burst,bank.weapons[second].burst,'Burst belongs to the weapon, not its source recording');
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
console.log('PASS: all116 firearm burst mappings, all34 sound assets, provenance hashes and script order');
