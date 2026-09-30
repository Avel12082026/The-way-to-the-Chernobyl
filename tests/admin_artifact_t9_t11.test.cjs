'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const expected={
  9:['Слизь','Слизняк','Капли','Кристалл','Колючка','Кристальная колючка','Морской ёж','Бенгальский огонь','Лунный свет','Плёнка'],
  10:['Каменный цветок','Ночная звезда','Выверт','Грави','Золотая рыбка','Кровь камня','Ломоть мяса','Душа','Колобок','Мамины бусы'],
  11:['Светляк','Снежинка','Пустышка','Компас','Аленький цветочек','Изменённый изолятор','Изменённый штурвал','Аномальное растение','Сердце Оазиса','Гиперкуб']
};
const catalog=html.match(/const artifacts = \[([\s\S]*?)\n\s*\];/);
assert(catalog,'artifact catalog missing');
for(const [tier,names] of Object.entries(expected)){
  for(const name of names){
    assert(catalog[1].includes(`name: "${name}", tier: ${tier}`),`missing T${tier} artifact: ${name}`);
  }
}
const start=html.indexOf('function adminArtifactCatalog()');
const end=html.indexOf('// Изымает точное количество',start);
assert(start>=0&&end>start,'admin artifact grant block missing');
const admin=html.slice(start,end);
assert(admin.includes('Number(a.tier) >= 1 && Number(a.tier) <= 11'),'admin catalog must allow T1-T11');
assert(admin.includes("tierEl.max = giveType === 'artifact' ? '11' : '14'"),'artifact tier input must cap at 11');
assert(admin.includes('const list = adminArtifactCatalog();'),'artifact dropdown must use admin catalog');
const giveStart=html.indexOf('async function giveAdminItem()');
const giveEnd=html.indexOf('async function searchAdminPlayers',giveStart);
const give=html.slice(giveStart,giveEnd>giveStart?giveEnd:giveStart+20000);
assert(give.includes('pickItem(adminArtifactCatalog())'),'self/other grant path must use T1-T11 admin catalog');
console.log('PASS: admin can grant all T9-T11 artifacts to self or another player');
