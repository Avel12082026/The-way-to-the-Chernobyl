(function(root){
'use strict';
// A shared landscape covers both fighters. Levels choose a local pool;
// subsequent encounters vary within that pool without changing mid-fight.
const base='images/combat/backgrounds/';
const entries=Object.freeze([
 ['field','side/field.png',1],
 ['flesh-1','flesh/1.png',1],['flesh-2','flesh/2.png',1],['flesh-3','flesh/3.png',1],
 ['chernobyl-dog-1','chernobyl-dog/1.png',100],
 ['chernobyl-dog-2','chernobyl-dog/2.png',100],
 ['chernobyl-dog-3','chernobyl-dog/3.png',100],
 ['boar-1','boar/1.png',200],['boar-2','boar/2.png',200],['boar-3','boar/3.png',200],
 ['hinge-1','hinge/1.png',300],['hinge-2','hinge/2.png',300],
 ['reactor','side/reactor.png',500]
].map(([id,path,minLevel])=>Object.freeze({id,image:base+path,minLevel,groundY:940,shadowOpacity:0.3})));
const byId=new Map(entries.map(entry=>[entry.id,entry]));
const groups=Object.freeze([
 {min:1,ids:['field','flesh-1','flesh-2','flesh-3']},
 {min:100,ids:['chernobyl-dog-1','chernobyl-dog-2','chernobyl-dog-3']},
 {min:200,ids:['boar-1','boar-2','boar-3']},
 {min:300,ids:['hinge-1','hinge-2']},
 {min:500,ids:['reactor','hinge-1','hinge-2']}
]);
function normalizeLevel(value){
 const n=(typeof value==='number'||typeof value==='string')?Number(value):NaN;
 return Number.isFinite(n)&&n>=1?Math.floor(n):1;
}
function normalizeToken(value){
 if(typeof value==='string')return value.trim()?value:null;
 return typeof value==='number'&&Number.isFinite(value)?String(value):null;
}
function hash(value){
 let result=2166136261;
 for(let i=0;i<value.length;i++)result=Math.imul(result^value.charCodeAt(i),16777619)>>>0;
 return result;
}
function createSelector(options={}){
 const requested=Number(options.maxBattles);
 const maxBattles=Number.isFinite(requested)&&requested>=1?Math.min(1024,Math.floor(requested)):128;
 const battles=new Map(),lastByGroup=new Map();
 function resolve({playerLevel,battleToken}={}){
  const token=normalizeToken(battleToken);
  // Equipment, health, or level updates cannot move an existing encounter.
  if(token!==null&&battles.has(token))return {...battles.get(token)};
  const level=normalizeLevel(playerLevel);
  const group=groups.reduce((selected,next)=>level>=next.min?next:selected,groups[0]);
  let index=hash(token===null?'level:'+level:token)%group.ids.length;
  if(token!==null&&group.ids.length>1&&group.ids[index]===lastByGroup.get(group.min))index=(index+1)%group.ids.length;
  const entry=byId.get(group.ids[index]);
  if(token!==null){
   lastByGroup.set(group.min,entry.id);
   battles.set(token,entry);
   if(battles.size>maxBattles)battles.delete(battles.keys().next().value);
  }
  return {...entry};
 }
 return {resolve};
}
const api={...createSelector(),createSelector,entries};
root.CombatBackgrounds=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
