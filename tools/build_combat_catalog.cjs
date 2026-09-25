const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const {layout}=require('../images/combat/layout.js');
const environments=require('../images/combat/environments.json');
function array(name){return vm.runInNewContext(html.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n    \\]);'))[1]);}
const mutants=array('mutants'),weapons=array('weapons');
const ids='tushkan blind-dog chernobyl-dog krakozyabra flesh boar isotope hinge zombie pseudodog lynx chupacabra psydog bayun snork stregun owl bloodsucker poltergeist fire-poltergeist fracture burer moose controller stronglav chimera electrochimera observer pseudogiant'.split(' ');
// Scene selection is location-aware through environments-v2.js. These three
// Cordon paths only support the legacy asset resolver if that provider is absent.
const fallbackBackgrounds=['environments/01.webp','environments/02.webp','environments/03.webp'];
const species=mutants.slice(0,29).map((m,i)=>{const id=ids[i],mutant=`mutants/${id}.png`,backgrounds=environments[id]||fallbackBackgrounds;return {id,name:m.name,tier:m.tier,habitat:Math.floor(m.tier/4),mutant,backgrounds,ready:[mutant,...backgrounds].every(p=>fs.existsSync(path.join(root,'images/combat',p)))};});
if(mutants.length!==57||mutants.slice(29).some(m=>!m.name.startsWith('Самка ')))throw Error('Unexpected mutant roster');
const entries=mutants.map((m,i)=>({name:m.name,tier:m.tier,species:ids[i<29?i:i-28]}));
const pistolIds=[86,2,87,1,3,88,5,6,89,90,91,92,93,7,94,95,96,97,98,99,100,101,102,103,104,105];
const pistols=pistolIds.map(id=>({id,name:weapons.find(w=>w.id===id).name,image:`pistols/${id}.png`,ready:!!layout.pistols[id]&&fs.existsSync(path.join(root,'images/combat/pistols',id+'.png'))}));
const catalog={species,entries,pistols,armorIds:Array.from({length:96},(_,i)=>i+1),femalePolicy:'Same species image and backgrounds as the corresponding base mutant'};
fs.writeFileSync(path.join(root,'images/combat/catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(root,'images/combat/catalog.js'),'window.COMBAT_ASSETS = '+JSON.stringify(catalog)+';\n');
console.log(`${species.filter(s=>s.ready).length}/29 species; ${pistols.filter(p=>p.ready).length}/26 pistols`);
