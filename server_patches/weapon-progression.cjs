'use strict';

module.exports=function installWeaponProgression(ctx){
  const {
    app,SHOP_WEAPONS,PVE_MUTANTS,PVE_NPC_TIER_HP,PVE_NPC_TIER_DMG,PVE_NPC_TIER_MULT
  }=ctx||{};
  if(!Array.isArray(SHOP_WEAPONS)||!Array.isArray(PVE_MUTANTS))
    throw new Error('weapon progression: missing live catalogues');

  const DATA=require('./weapon-progression.json');
  const byName=new Map(DATA.entries.map(x=>[x.name,x]));
  const adminSnapshot=new Map(SHOP_WEAPONS.filter(w=>w.adminOnly).map(w=>[w.name,JSON.stringify(w)]));

  for(const weapon of SHOP_WEAPONS){
    if(weapon.adminOnly)continue;
    const spec=byName.get(weapon.name);
    if(!spec)throw new Error('weapon progression: no balance row for '+weapon.name);
    weapon.unlockLevel=spec.unlockLevel;
    weapon.dmg=spec.damage;
    weapon.price=spec.price;
    weapon.progressionCategory=spec.category;
    weapon.progressionSequence=spec.sequence;
    weapon.progressionStep=spec.globalStep;
    weapon.caliber=spec.caliber;
  }
  for(const [name,json] of adminSnapshot){
    const now=SHOP_WEAPONS.find(w=>w.name===name);
    if(!now||JSON.stringify(now)!==json)throw new Error('weapon progression changed admin weapon '+name);
  }

  const npcHp=[0,280,500,800,1200,1800,2500,3300,4300,5500,6900,8300,9800,11500,13300];
  const npcDmg=[0,26,31,36,42,48,55,63,71,80,90,101,113,126,140];
  for(let tier=1;tier<=14;tier++){
    PVE_NPC_TIER_HP[tier]=npcHp[tier];
    PVE_NPC_TIER_DMG[tier]=npcDmg[tier];
    PVE_NPC_TIER_MULT[tier]=1;
  }

  // Mutant health now grows against the new bounded weapon curve instead of the old
  // exponential +100 weapon economy. Female variants follow their own stored tier.
  for(const mutant of PVE_MUTANTS){
    const tier=Math.max(0,Number(mutant.tier)||0);
    mutant.hp=Math.round(160+18*tier*tier);
    mutant.dmg=Math.round(28+3.5*tier);
  }

  function available(level){
    const lv=Math.max(1,Number(level)||1);
    return SHOP_WEAPONS.filter(w=>!w.adminOnly&&!w.isPremiumWeapon&&Number(w.unlockLevel)<=lv);
  }
  function combatPool(level){
    const pool=available(level);
    if(!pool.length)return [];
    const maxUnlock=Math.max(...pool.map(w=>Number(w.unlockLevel)||0));
    // Keep NPC equipment current but varied: the newest three 5-level unlock waves.
    return pool.filter(w=>(Number(w.unlockLevel)||0)>=Math.max(1,maxUnlock-10));
  }
  function effectiveDamage(itemName){
    const raw=String(itemName||'').replace(/[\u200B\u200C]+$/,'');
    const m=raw.match(/^(.*) \+(\d+)$/);
    const baseName=m?m[1]:raw;
    const level=Math.min(50,Math.max(0,m?Number(m[2])||0:0));
    const weapon=SHOP_WEAPONS.find(w=>w.name===baseName);
    if(!weapon||weapon.adminOnly)return null;
    const pct=Math.min(.25,level*.005);
    return Math.round((Number(weapon.dmg)||0)*(1+pct));
  }

  if(app&&typeof app.get==='function'){
    app.get('/api/weapon-progression/version',(_req,res)=>res.json({
      success:true,version:DATA.version,maxOrdinaryUpgrade:50,
      adminExcluded:[...DATA.adminExcluded],finalUnlockLevel:335
    }));
  }

  return Object.freeze({
    version:DATA.version,
    adminExcluded:[...DATA.adminExcluded],
    available,combatPool,effectiveDamage,
    npcHp:[...npcHp],npcDmg:[...npcDmg]
  });
};
