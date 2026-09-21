'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');

const weaponMatch=html.match(/const weapons = (\[[\s\S]*?\n    \]);/);
assert(weaponMatch,'weapons array missing');
const helperMatch=html.match(/\/\/ WEAPON_UNLOCK_EVERY_3_LEVELS_V1([\s\S]*?)\/\/ ===== БРОНЯ =====/);
assert(helperMatch,'weapon progression helper missing');

const ctx={console};
vm.createContext(ctx);
vm.runInContext(
  'const weapons = '+weaponMatch[1]+';\n// WEAPON_UNLOCK_EVERY_3_LEVELS_V1'+helperMatch[1]+
  '\nglobalThis.__weapons=weapons;globalThis.__order=WEAPON_PROGRESSION_ORDER;',
  ctx
);

const weapons=ctx.__weapons,order=ctx.__order;
assert.equal(weapons.length,117);
assert.equal(order.length,116);

for(let i=0;i<order.length;i++){
  assert.equal(order[i].progressionIndex,i,'progression index '+i);
  assert.equal(order[i].unlockLevel,1+i*3,'unlock level '+i);
}

assert.equal(order[0].name,'Beretta 21A Bobcat');
assert.equal(order[28].name,'Desert Eagle Mark XIX');
assert.match(order[29].name,/^Дробовик /);
assert.equal(order[57].name,'Дробовик Remington SP-10');
assert.match(order[58].name,/^(Автомат|Пулемёт|Карабин) /);
assert.equal(order[86].name,'Пулемёт «Утёс-М»');
assert.match(order[87].name,/^(Винтовка|Прототип|Гаусс)/);
assert.equal(order[115].name,'Гаусс-пушка');

assert.equal(order[0].unlockLevel,1);
assert.equal(order[1].unlockLevel,4);
assert.equal(order[28].unlockLevel,85);
assert.equal(order[29].unlockLevel,88);
assert.equal(order[57].unlockLevel,172);
assert.equal(order[58].unlockLevel,175);
assert.equal(order[86].unlockLevel,259);
assert.equal(order[87].unlockLevel,262);
assert.equal(order[115].unlockLevel,346);

assert(html.includes('const unlockWeaponsByLevel = () => WEAPON_PROGRESSION_ORDER.filter'));
assert(html.includes('player.level >= (w.unlockLevel || 0)'));

console.log(JSON.stringify({
  status:'passed',
  first:order[0].name,
  pistolEnd:{name:order[28].name,level:order[28].unlockLevel},
  shotgunStart:{name:order[29].name,level:order[29].unlockLevel},
  automaticStart:{name:order[58].name,level:order[58].unlockLevel},
  rifleStart:{name:order[87].name,level:order[87].unlockLevel},
  last:{name:order[115].name,level:order[115].unlockLevel}
},null,2));
