"""Targeted reconciliation of the reviewed parallel 181d162 main update after git merge."""
from pathlib import Path
import re

def edit(path,old,new):
    p=Path(path);s=p.read_text()
    if old not in s:
        assert new in s,(path,old[:80]);return
    assert s.count(old)==1,(path,old[:80],s.count(old))
    p.write_text(s.replace(old,new))

# Preserve main's 15%-per-turn radiation rule; searches never apply sickness.
edit('server_patches/raid-survival.cjs',
    'module.exports=Object.freeze({version:VERSION,travelCost:2,ANOMALY_KEYS,DAMAGE,DOSE,environmentalUpgrades,search});',
    '''function radiationDamage(data){
  const damage=round(clamp(finite(data.radiation),0,100)*0.15);
  data.health=round(Math.max(0,finite(data.health)-damage));
  return damage;
}
module.exports=Object.freeze({version:VERSION,travelCost:2,ANOMALY_KEYS,DAMAGE,DOSE,environmentalUpgrades,search,radiationDamage});''')
edit('tools/patch_raid_survival.py',
    "    for key in ('hunger','thirst'):",
    '''    old_radiation="""function pveRadiationDamage(data) {
    const rad=Math.max(0,Number(data.radiation)||0);
    if(rad<=0) return 0;
    data.health=Math.round(Math.max(0,(Number(data.health)||0)-rad)*10)/10;
    return rad;
}"""
    s=once(s,old_radiation,"function pveRadiationDamage(data) {\\n    return RaidSurvival.radiationDamage(data);\\n}")
    for key in ('hunger','thirst'):''')
edit('tests/raid_survival.test.cjs',
    "const before=state().health;const step=call('/api/raid/step');assert.equal(step.success,true);assert.equal(step.radiationDamage,rad);assert.equal(step.state.health,Math.round((before-rad)*10)/10);",
    "const before=state().health,doseDamage=Math.round(rad*0.15*10)/10;const step=call('/api/raid/step');assert.equal(step.success,true);assert.equal(step.radiationDamage,doseDamage);assert.equal(step.state.health,Math.round((before-doseDamage)*10)/10);")
edit('tests/raid_survival.test.cjs','assert.equal(second.radiationDamage,rad);','assert.equal(second.radiationDamage,doseDamage);')
edit('tests/raid_survival.test.cjs','const rows=[];',"const fullDose={health:200,radiation:100};assert.equal(model.radiationDamage(fullDose),15);assert.equal(fullDose.health,185);\nconst rows=[];")
edit('RAID_FIVE_UPDATE_20260920.md','through the existing server radiation-damage function.','through the server radiation-damage function at 15% of contamination per turn (100 radiation = 15 HP).')
for path in ['ui/quests.js','tools/apply_raid_five_client.py']:
    edit(path,'class="raid-quest-entry${','class="raid-quest-entry raid-quest-track-item${')
# The common renderer covers all information windows; suppress only duplicate old metadata.
edit('ui/balance-tuning.js',"if(body&&!body.querySelector('.item-reference-meta')){","if(body&&!window.ItemReference&&!body.querySelector('.item-reference-meta')){")
p=Path('tests/quests.browser.py');s=p.read_text().replace("tracker.locator('.raid-quest-track-item').first", "tracker.locator('.raid-quest-track-item[data-quest-id=\"q1\"]')");p.write_text(s)
p=Path('tests/raid_quickslot.browser.py');s=p.read_text().replace("'Можно использовать с уровня:'", "'Уровень использования:'").replace("'Средняя цена:'", "'Средняя цена рынка'");p.write_text(s)
p=Path('tests/raid_pda_five.static.cjs');s=p.read_text().replace('20260920r9','20260920-five1').replace("version:'1.3.6'", "version:'1.4.0'").replace('#raidMetersRow>div:not(#raidExpTrack)>div:first-child','#raidMetersRow>.raid-radiation-wrapper>.raid-radiation-label');p.write_text(s)
p=Path('ui/trader-hubs.js');s=p.read_text();s,n=re.subn(r'ui/balance-tuning\.js\?v=[^\x27]+','ui/balance-tuning.js?v=20260920-five1',s);assert n==1;p.write_text(s)
# Keep the independently added legacy installer, fixing its duplicate subprocess keyword.
edit('tools/install_raid_survival_server.py','    return subprocess.run(cmd,check=True,**kw)','    kw.setdefault("check",True)\n    return subprocess.run(cmd,**kw)')
# Hashes were computed against the actual owner-supplied server, without committing it.
edit('tools/install_raid_five_update.py',"SERVER_AFTER='242fcc9378de56874468efe0d95c5dd1df584f98879a6e9c3b064828bc9cc276'","SERVER_AFTER='5d0f4b1f6f16671f9fc2e49e2604175857b1d492b4c86a7b748fb74eb0f9fe14'")
edit('tools/install_raid_five_update.py',"MODULE_HASH='ceb6389170455fd07568fc4e41cfdfb3ef89764ee2485b058e8cc6b8228733e8'","MODULE_HASH='96cf3687a21bd8d7e6e79f9ce4deb082b900703d1f929f74a3f9023ed781a1a4'")
