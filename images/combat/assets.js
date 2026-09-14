(function(root){
'use strict';
function createResolver(catalog){
 const normalize=s=>String(s||'').normalize('NFC').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
 const entries=new Map(catalog.entries.map(e=>[normalize(e.name),e]));
 const species=new Map(catalog.species.map(s=>[s.id,s]));
 return {getVisuals(enemy,variant=0){const entry=entries.get(normalize(enemy?.name));const s=entry&&species.get(entry.species);if(!s?.ready)return {ready:false};return {ready:true,species:s.id,mutant:'images/combat/'+s.mutant,background:'images/combat/'+s.backgrounds[((variant%3)+3)%3]};}};
}
root.CombatAssets=root.COMBAT_ASSETS?createResolver(root.COMBAT_ASSETS):null;
if(typeof module!=='undefined')module.exports={createResolver};
})(typeof window!=='undefined'?window:globalThis);
