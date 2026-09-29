'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),bank=require('../audio/combat-mutants.js'),catalog=require('../images/combat/catalog.json');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const gameplay=vm.runInNewContext(html.match(/const mutants = (\[[\s\S]*?\n    \]);/)[1]);
assert.equal(gameplay.length,57);
assert.equal(bank.base,'audio/mutants/');
assert.deepEqual(Object.keys(bank.species).sort(),catalog.species.map(s=>s.id).sort());
// Every live gameplay name and every visual alias routes to the same species,
// including females; changing location tier or HP must not change its voice.
for(let i=0;i<gameplay.length;i++){
 const expected=catalog.entries[i].species;
 for(const name of [gameplay[i].name,catalog.entries[i].name]){
  assert.equal(bank.resolve({kind:'mutant',name,tier:28,sourceTier:0}),expected,name);
  assert.equal(bank.resolve({kind:'mutant',name:'  '+name.toUpperCase().replace(/Ё/g,'Е')+'  ',sex:'female'}),expected,name);
  assert.equal(bank.resolve({kind:'npc',name,mutant:true}),null,'NPC cannot borrow a mutant voice');
 }
}
for(const name of ['Псевдо собака','Пси-собака','Электро химера','Контролер'])assert.ok(bank.resolve({kind:'mutant',name}));
for(const enemy of [null,{}, {kind:'mutant',name:'Неизвестный'}, {name:'Тушкан'}, {kind:'mutant',species:'__proto__'}])assert.equal(bank.resolve(enemy),null);
const files=[];
for(const [id,species] of Object.entries(bank.species)){
 assert.equal(bank.resolve({kind:'mutant',species:id}),id);
 assert.equal(species.tier,catalog.species.find(s=>s.id===id).tier);
 for(const event of ['hurt','attack']){
  const profile=species[event];
  assert.deepEqual(profile.files,[1,2,3].map(n=>id+'-'+event+'-'+n+'.mp3'));
  assert.ok(profile.gain>0&&profile.gain<=1);
  if(event==='attack')assert.equal(profile.impactMs,120);
  files.push(...profile.files.map(file=>bank.base+file));
 }
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
assert.equal(files.length,174);
assert.equal(new Set(files.map(hash)).size,174,'Each species/event/variant must ship distinct audio');
assert.deepEqual(fs.readdirSync(path.join(root,bank.base)).map(file=>bank.base+file).sort(),files.sort());
assert.ok(files.reduce((sum,file)=>sum+fs.statSync(path.join(root,file)).size,0)<3*1024*1024,'Mutant audio stays within its 3 MiB download budget');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'audio/mutant-sources.json'),'utf8'));
assert.equal(provenance.clips.length,174);
assert.deepEqual(provenance.clips.map(clip=>clip.path).sort(),files.sort());
for(const clip of provenance.clips)assert.equal(hash(clip.path),clip.sha256,'Provenance matches '+clip.path);
const manifestAt=html.indexOf('src="audio/combat-mutants.js'),moduleAt=html.indexOf('src="audio/combat-audio.js');
assert.ok(manifestAt>=0&&manifestAt<moduleAt,'Load mutant catalog before the playback module');
console.log('PASS: 29 species, 57 gameplay variants, 87 hurt + 87 attack clips, shared voices by sex and complete provenance');
