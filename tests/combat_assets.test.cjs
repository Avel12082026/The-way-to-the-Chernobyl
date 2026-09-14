const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),catalog=require('../images/combat/catalog.json'),{createResolver}=require('../images/combat/assets.js');
const resolver=createResolver(catalog);
assert.equal(catalog.species.length,29);assert.equal(catalog.entries.length,57);assert.equal(catalog.pistols.length,26);
for(let i=29;i<57;i++)for(let v=0;v<3;v++)assert.deepEqual(resolver.getVisuals(catalog.entries[i],v),resolver.getVisuals(catalog.entries[i-28],v));
assert.deepEqual(resolver.getVisuals({name:'Unknown'}),{ready:false});
for(const s of catalog.species.filter(s=>s.ready)){assert.equal(s.backgrounds.length,3);assert.equal(new Set(s.backgrounds).size,3);for(const f of [s.mutant,...s.backgrounds])assert.ok(fs.existsSync(path.join(root,'images/combat',f)),f);}
for(const p of catalog.pistols.filter(p=>p.ready))assert.ok(fs.existsSync(path.join(root,'images/combat',p.image)));
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'images/combat/catalog.js'),'utf8'),ctx);assert.equal(JSON.stringify(ctx.window.COMBAT_ASSETS),JSON.stringify(catalog));
console.log('Combat catalog, ready assets and all female mappings verified');
