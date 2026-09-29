'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),bank=require('../audio/combat-reactions.js');
assert.deepEqual(Object.keys(bank.reactions).sort(),['enemy','player']);
assert.equal(bank.base,'audio/reactions/');
const files=[];
for(const [actor,reaction] of Object.entries(bank.reactions)){
 assert.deepEqual(reaction.files,Array.from({length:actor==='player'?2:8},(_,i)=>actor+'-hurt-'+(i+1)+'.mp3'));
 assert.ok(reaction.gain>0&&reaction.gain<=1.5);
 for(const file of reaction.files)files.push(bank.base+file);
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
assert.equal(new Set(files.map(hash)).size,10,'All player and NPC variants need distinct recordings');
assert.deepEqual(fs.readdirSync(path.join(root,bank.base)).map(file=>bank.base+file).sort(),files.sort());
assert.ok(files.reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0)<300000,'The ten short reactions stay small');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'audio/reaction-sources.json'),'utf8')),clips=[];
function collect(value){if(!value||typeof value!=='object')return;if(value.path?.startsWith(bank.base)&&value.sha256)clips.push(value);for(const item of Object.values(value))if(typeof item==='object')collect(item);}
collect(provenance);
assert.equal(clips.length,10,'Every shipped clip must have provenance');
assert.deepEqual(clips.map(clip=>clip.path).sort(),files.sort());
for(const clip of clips)assert.equal(hash(clip.path),clip.sha256,'Credits must match the actual sound file');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const reaction=html.indexOf('src="audio/combat-reactions.js'),audio=html.indexOf('src="audio/combat-audio.js');
assert.ok(reaction>=0&&reaction<audio,'Load hurt reactions before the playback module');
console.log('PASS: two player and eight NPC hurt variants, distinct credited assets and production script order');
