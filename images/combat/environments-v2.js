(function(root){
'use strict';
// Numeric IDs match ZoneMap.location and the zoneLocation sent to /api/raid/zone-step.
// Progression unlocks travel; the current location, never the player's level,
// determines which five views can be selected for this encounter.
const zoneDefinitions=[
 {id:1,slug:'cordon',label:'Кордон',names:['Деревня новичков','Железнодорожный мост','Автотранспортное предприятие','Северная ферма','Южный блокпост']},
 {id:2,slug:'garbage',label:'Свалка',names:['Кладбище техники','Железнодорожный ангар','Центральная дорога Свалки','Пост Долга','Разрушенная контора']},
 {id:3,slug:'agroprom',label:'НИИ Агропром',names:['Двор завода Агропром','Военный НИИ','Железнодорожный подъезд','Периметр НИИ','Подземелья Агропрома']},
 {id:4,slug:'rostok',label:'Росток',names:['Вход в Росток','Двор у бара «100 рентген»','Арена','Штаб Долга','Промышленный проход Ростока']}
];
const entries=Object.freeze(zoneDefinitions.flatMap(zone=>zone.names.map((label,index)=>Object.freeze({
 id:(zone.id-1)*5+index+1,zoneId:zone.id,zone:zone.slug,label:zone.label+' — '+label,
 path:'images/combat/environments/'+String((zone.id-1)*5+index+1).padStart(2,'0')+'.webp',groundY:940
}))));
const zones=Object.freeze(zoneDefinitions.map(({id,slug,label})=>Object.freeze({id,slug,label,entries:Object.freeze(entries.filter(entry=>entry.zoneId===id))})));
const aliases=Object.freeze({cordon:1,'кордон':1,garbage:2,'свалка':2,agroprom:3,'агропром':3,'нии агропром':3,rostok:4,rosstok:4,'росток':4,'россток':4});
function normalizeLocation(value){
 if(value&&typeof value==='object')value=value.zoneLocation??value.zoneId??value.locationId??value.id??value.slug??value.name;
 if(typeof value==='number')return Number.isInteger(value)&&value>=1&&value<=4?value:1;
 const key=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
 return /^[1-4]$/.test(key)?Number(key):(Object.prototype.hasOwnProperty.call(aliases,key)?aliases[key]:1);
}
function hash(value){let n=2166136261;for(const c of String(value))n=Math.imul(n^c.charCodeAt(0),16777619);n^=n>>>16;n=Math.imul(n,0x85ebca6b);n^=n>>>13;return n>>>0;}
function select(input={}){
 const token=input.battleToken??input.enemy?.battleToken??'';
 const location=input.zoneLocation??input.locationId??input.location??input.enemy?.zoneLocation??input.enemy?.locationId??input.enemy?.location;
 const zone=zones[normalizeLocation(location)-1];
 return zone.entries[hash(zone.id+'\u0000'+String(token))%zone.entries.length];
}
const api=Object.freeze({version:'combat-environments-zones-v2',entries,zones,normalizeLocation,select});root.CombatEnvironments=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
