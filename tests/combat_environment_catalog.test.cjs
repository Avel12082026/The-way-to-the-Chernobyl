'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const combat=fs.existsSync(path.join(root,'catalog.json'))?root:path.join(root,'images/combat');
const catalog=JSON.parse(fs.readFileSync(path.join(combat,'catalog.json'),'utf8'));
const environments=JSON.parse(fs.readFileSync(path.join(combat,'environments.json'),'utf8'));
const resolver=require(path.join(combat,'assets.js')).createResolver(catalog);
const expected=['environments/01.webp','environments/02.webp','environments/03.webp'];
const browser={window:{}};vm.runInNewContext(fs.readFileSync(path.join(combat,'catalog.js'),'utf8'),browser);
assert.deepEqual(JSON.parse(JSON.stringify(browser.window.COMBAT_ASSETS)),catalog,'Browser and JSON catalogs are identical');
assert.equal(catalog.species.length,29);assert.equal(catalog.entries.length,57);
for(const species of catalog.species){
 assert.deepEqual(species.backgrounds,expected,'Unknown-location legacy fallback stays in Cordon');
 assert.deepEqual(environments[species.id],expected);
 for(let i=0;i<3;i++){
  const visual=resolver.getVisuals({name:species.name},i);
  assert.equal(visual.background,'images/combat/'+expected[i]);
  assert.equal(visual.mutant,'images/combat/'+species.mutant);
 }
}
// Build in an isolated fixture containing only the new backgrounds. This catches
// a future catalog rebuild resurrecting paths to deleted legacy PNG files.
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'combat-catalog-zones-'));
try{
 for(const subdir of ['tools','images/combat'])fs.mkdirSync(path.join(fixture,subdir),{recursive:true});
 fs.copyFileSync(path.join(root,'tools/build_combat_catalog.cjs'),path.join(fixture,'tools/build_combat_catalog.cjs'));
 fs.copyFileSync(path.join(root,'index.html'),path.join(fixture,'index.html'));
 for(const name of ['environments.json','layout.js'])fs.copyFileSync(path.join(combat,name),path.join(fixture,'images/combat',name));
 const imagePaths=[...expected,...catalog.species.map(s=>s.mutant),...catalog.pistols.map(p=>p.image)];
 for(const relative of imagePaths){const p=path.join(fixture,'images/combat',relative);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'fixture');}
 function build(){
  const result=spawnSync(process.execPath,[path.join(fixture,'tools/build_combat_catalog.cjs')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(fs.readFileSync(path.join(fixture,'images/combat/catalog.json'),'utf8'));
 }
 const rebuilt=build();
 // The pre-existing generated catalog has three display-name spellings that
 // differ from index.html. Rebuilds deliberately obtain labels from that roster.
 const withoutRosterLabels=value=>({...value,species:value.species.map(({name,...rest})=>rest),entries:value.entries.map(({name,...rest})=>rest)});
 assert.deepEqual(withoutRosterLabels(rebuilt),withoutRosterLabels(catalog),'Rebuild needs no removed backgrounds and preserves species, tiers, variants, weapons and armor');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const roster=vm.runInNewContext(html.match(/const mutants = (\[[\s\S]*?\n    \]);/)[1]);
 assert.deepEqual(rebuilt.entries.map(entry=>entry.name),Array.from(roster,entry=>entry.name),'Rebuild labels still come from the game roster');
 const partial={...environments};delete partial.tushkan;
 fs.writeFileSync(path.join(fixture,'images/combat/environments.json'),JSON.stringify(partial));
 assert.deepEqual(build(),rebuilt,'Species absent from the compatibility map also use a valid new fallback');
 fs.unlinkSync(path.join(fixture,'images/combat/environments/03.webp'));
 assert.ok(build().species.every(s=>!s.ready),'A missing new background is still caught by asset-readiness checks');
}finally{fs.rmSync(fixture,{recursive:true,force:true});}
console.log('PASS: 29 species, 57 encounters, exact browser/JSON catalog parity, and rebuild after old PNG removal');
