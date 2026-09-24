(function(root){
'use strict';
// One reusable pose per armor, one reusable image per weapon.
// Hands are a shared foreground layer per armor, never per equipment pair.
const data={"version":"20260924-modular-pistols","characters":{"1":{"grip":[838,314]},"2":{"grip":[844,313]},"3":{"grip":[843,313]},"4":{"grip":[813,274]},"5":{"grip":[815,318]},"6":{"grip":[826,230]},"7":{"grip":[877,285]},"8":{"grip":[850,246]},"9":{"grip":[847,285]},"10":{"grip":[840,293]},"11":{"grip":[865,321]},"12":{"grip":[881,315]},"13":{"grip":[890,288]},"14":{"grip":[867,264]},"15":{"grip":[867,269]},"16":{"grip":[851,285]},"17":{"grip":[868,289]},"18":{"grip":[844,293]},"19":{"grip":[866,316]},"20":{"grip":[830,309]},"21":{"grip":[752,311]},"22":{"grip":[837,320]},"23":{"grip":[785,303]},"24":{"grip":[841,299]},"25":{"grip":[807,302]},"26":{"grip":[793,346]},"27":{"grip":[802,299]},"28":{"grip":[824,286]},"29":{"grip":[815,335]},"30":{"grip":[783,305]},"31":{"grip":[854,357]},"32":{"grip":[828,263]},"33":{"grip":[814,330]},"34":{"grip":[823,272]},"35":{"grip":[811,285]},"36":{"grip":[786,356]},"37":{"grip":[801,276]},"38":{"grip":[860,296]},"39":{"grip":[857,317]},"40":{"grip":[801,246]},"41":{"grip":[872,313]},"42":{"grip":[813,320]},"43":{"grip":[867,304]},"44":{"grip":[886,352]},"45":{"grip":[867,259]},"46":{"grip":[881,272]},"47":{"grip":[915,276]},"48":{"grip":[876,313]},"49":{"grip":[871,324]},"50":{"grip":[871,303]},"51":{"grip":[887,317]},"52":{"grip":[885,317]},"53":{"grip":[860,328]},"54":{"grip":[858,306]},"55":{"grip":[876,314]},"56":{"grip":[897,338]},"57":{"grip":[906,304]},"58":{"grip":[858,296]},"59":{"grip":[840,323]},"60":{"grip":[897,265]},"61":{"grip":[876,284]},"62":{"grip":[884,292]},"63":{"grip":[882,283]},"64":{"grip":[887,314]},"65":{"grip":[899,288]},"66":{"grip":[884,294]},"67":{"grip":[869,314]},"68":{"grip":[905,306]},"69":{"grip":[880,289]},"70":{"grip":[868,256]},"71":{"grip":[873,270]},"72":{"grip":[816,278]},"73":{"grip":[868,311]},"74":{"grip":[854,327]},"75":{"grip":[879,318]},"76":{"grip":[849,274]},"77":{"grip":[876,274]},"78":{"grip":[896,258]},"79":{"grip":[851,314]},"80":{"grip":[888,310]},"81":{"grip":[911,334]},"82":{"grip":[873,338]},"83":{"grip":[930,312]},"84":{"grip":[906,326]},"85":{"grip":[882,306]},"86":{"grip":[863,296]},"87":{"grip":[837,321]},"88":{"grip":[862,294]},"89":{"grip":[859,300]},"90":{"grip":[845,292]},"91":{"grip":[856,259]},"92":{"grip":[883,284]},"93":{"grip":[896,326]},"94":{"grip":[872,348]},"95":{"grip":[901,305]},"96":{"grip":[843,314]}},"weapons":{"1":{"grip":[290,650],"scale":0.16,"name":"Пистолет Макарова"},"2":{"grip":[340,650],"scale":0.16,"name":"Пистолет ПСМ"},"3":{"grip":[260,650],"scale":0.16,"name":"Пистолет ИЖ-71"},"5":{"grip":[300,650],"scale":0.16,"name":"Пистолет ОЦ-33 «Пернач»"},"6":{"grip":[180,690],"scale":0.18,"name":"Револьвер Наган"},"7":{"grip":[320,650],"scale":0.16,"name":"Пистолет ТТ"},"86":{"grip":[400,650],"scale":0.16,"name":"Beretta 21A Bobcat"},"87":{"grip":[360,660],"scale":0.16,"name":"Walther PPK"},"88":{"grip":[300,650],"scale":0.16,"name":"Glock 25"},"89":{"grip":[300,650],"scale":0.16,"name":"Walther P99"},"90":{"grip":[290,650],"scale":0.16,"name":"CZ 75"},"91":{"grip":[310,650],"scale":0.16,"name":"Glock 17"},"92":{"grip":[340,690],"scale":0.16,"name":"Beretta 92FS"},"93":{"grip":[340,650],"scale":0.16,"name":"SIG Sauer P226"},"94":{"grip":[300,640],"scale":0.16,"name":"HK USP"},"95":{"grip":[310,640],"scale":0.16,"name":"Glock 22"},"96":{"grip":[340,650],"scale":0.16,"name":"SIG Sauer P229"},"97":{"grip":[330,670],"scale":0.16,"name":"Glock 20"},"98":{"grip":[310,650],"scale":0.16,"name":"Colt 1911"},"99":{"grip":[335,680],"scale":0.16,"name":"Glock 21"},"100":{"grip":[340,685],"scale":0.16,"name":"CZ 97B"},"101":{"grip":[320,660],"scale":0.16,"name":"HK Mark 23"},"102":{"grip":[280,750],"scale":0.18,"name":"Taurus Judge"},"103":{"grip":[190,720],"scale":0.18,"name":"Smith & Wesson Model 29"},"104":{"grip":[275,730],"scale":0.18,"name":"Taurus Raging Bull"},"105":{"grip":[360,650],"scale":0.18,"name":"Desert Eagle Mark XIX"}}};
const base='images/combat/modular/';
function resolve(gear){
 const armorId=Number(gear?.armorId),weaponId=Number(gear?.weaponId),key=armorId+':'+weaponId;
 const character=data.characters[armorId],weapon=data.weapons[weaponId];
 if(!character||!weapon)return {key,armorId,weaponId,ready:false};
 return {key,armorId,weaponId,ready:true,character,weapon,
  body:base+'characters/'+armorId+'-pistol.png',
  hands:base+'hands/'+armorId+'-pistol.png',
  gun:base+'weapons/'+weaponId+'.png'};
}
async function load(gear,loadImage){
 if(!gear?.ready)return null;
 const [body,hands,gun]=await Promise.all([loadImage(gear.body),loadImage(gear.hands),loadImage(gear.gun)]);
 return {body,hands,gun,character:gear.character,weapon:gear.weapon};
}
function draw(ctx,layers,side,offset=0){
 if(!layers||!['player','enemy'].includes(side))return false;
 const {body,hands,gun,character,weapon}=layers;
 const scale=800/body.height, x=(side==='player'?340:1196)+offset;
 ctx.save();ctx.translate(x,940);ctx.scale((side==='enemy'?-1:1)*scale,scale);
 ctx.translate(-body.width/2,-body.height);
 ctx.drawImage(body,0,0);
 ctx.save();ctx.translate(character.grip[0],character.grip[1]);ctx.scale(weapon.scale,weapon.scale);
 ctx.drawImage(gun,-weapon.grip[0],-weapon.grip[1]);ctx.restore();
 ctx.drawImage(hands,0,0);ctx.restore();return true;
}
const api={resolve,load,draw,data};root.CombatFighters=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
