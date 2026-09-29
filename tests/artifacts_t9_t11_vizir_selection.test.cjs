'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const patch=fs.readFileSync('server_patches/artifacts_t9_t11_vizir_20260929.patch','utf8');
const survival=require('../server_patches/raid-survival.cjs');
const selection=require('../server_patches/artifact-selection-radiation.cjs');
function array(name){const m=html.match(new RegExp('const\\s+'+name+'\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);'));assert(m,'missing '+name);return vm.runInNewContext(m[1],{});}
const artifacts=array('artifacts'),anomalies=array('anomalies'),armorItems=array('armorItems');
const expected={
  9:['Слизь','Слизняк','Капли','Кристалл','Колючка','Кристальная колючка','Морской ёж','Бенгальский огонь','Лунный свет','Плёнка'],
  10:['Каменный цветок','Ночная звезда','Выверт','Грави','Золотая рыбка','Кровь камня','Ломоть мяса','Душа','Колобок','Мамины бусы'],
  11:['Светляк','Снежинка','Пустышка','Компас','Аленький цветочек','Изменённый изолятор','Изменённый штурвал','Аномальное растение','Сердце Оазиса','Гиперкуб']
};
for(const [tier,names] of Object.entries(expected)){
  const rows=artifacts.filter(a=>Number(a.tier)===Number(tier)&&!a.adminOnly);
  assert.equal(rows.length,10,'ordinary artifact count T'+tier);
  assert.equal(JSON.stringify([...rows].map(a=>a.name)),JSON.stringify(names),'artifact names T'+tier);
}
const ordinaryLate=anomalies.filter(a=>[9,10,11].includes(Number(a.tier))&&!a.isNamedArtifactAnomaly);
assert.equal(JSON.stringify([...ordinaryLate].map(a=>[a.tier,a.name,a.artifacts.length])),JSON.stringify([[9,'Трамплин',10],[10,'Газировка',10],[11,'Жгучий пух',10]]));
const named=anomalies.filter(a=>a.isNamedArtifactAnomaly);
assert.equal(named.length,10);
assert(named.every(a=>a.tier===11),'all named anomalies must be T11');

const ctx={artifacts,anomalies,armorItems,window:{},document:{getElementById(){return null},createElement(){return{append(){}}}},stripInvisibleSuffix:s=>s,console};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('ui/balance-tuning.js','utf8'),ctx);
assert.equal(ctx.GameBalanceTuning.version,'1.4.0');
for(const [tier,minPos] of [[9,6],[10,7],[11,8]]){
  const rows=artifacts.filter(a=>Number(a.tier)===tier&&!a.adminOnly);
  for(const a of rows){
    assert(Object.values(a.stats).filter(v=>v>0).length>=minPos,a.name+' positive count');
    assert(Object.values(a.stats).some(v=>v<0),a.name+' must keep a drawback');
  }
}
const strongest=t=>Math.max(...artifacts.filter(a=>a.tier===t&&!a.adminOnly).flatMap(a=>Object.values(a.stats).filter(v=>v>0)));
assert(strongest(9)<strongest(10)&&strongest(10)<strongest(11),'late positive magnitudes must rise');

assert(patch.includes("if(String(detector.name||'')==='ВИЗИРЬ')return 11"));
assert(patch.includes("return Math.max(0,Math.min(8,Number(detector.tier)||0))"));
assert(patch.includes("Для именной аномалии T11 нужен детектор ВИЗИРЬ"));
assert(patch.includes("tier:11,isNamedArtifactAnomaly:true"));
assert(patch.includes('const ARTIFACT_STAT_VALUE_CAP = 2200;'));
assert(patch.includes('const ARTIFACT_STAT_MAX_KEYS = 30;'));
assert(patch.includes("tier:11,stats,isNamedArtifact:true"));
assert(patch.includes("named_artifacts_t11_buff_20260929"));

assert.equal(survival.DAMAGE[9],116);assert.equal(survival.DAMAGE[10],142);assert.equal(survival.DAMAGE[11],172);
const ordinary11={health:1000,radiation:0,radiationResist:0,anomalyResist:{}};
const x=survival.search(ordinary11,{tier:11,name:'Жгучий пух'},{},()=>.5);assert(x.anomalyDmg>0&&x.radiationDose>0);
const named11={health:1000,radiation:0,radiationResist:0,anomalyResist:{}};
const y=survival.search(named11,{tier:11,name:'Смерч',isNamedArtifactAnomaly:true},{},()=>.5);assert(y.anomalyDmg>x.anomalyDmg,'named T11 must be more dangerous than ordinary T11');

const a=artifacts.find(x=>x.name==='Компас'),b=artifacts.find(x=>x.name==='Гиперкуб');
const merged=selection.mergeStats(a.stats,b.stats,{perStatCap:11*10*20});
assert(Object.keys(merged).length>=8,'T11 selection must preserve/merge late stat breadth');
assert(Object.values(merged).every(Number.isFinite));
assert(Math.max(...Object.values(merged).map(Math.abs))<=2200);
console.log('PASS: 30 canonical late artifacts, ordinary/named T11 split, VIZIR T1-T11 access, scaling and T11 selection');