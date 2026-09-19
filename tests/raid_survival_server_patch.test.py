from pathlib import Path
import importlib.util, tempfile, subprocess
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('raid_survival',ROOT/'tools/install_raid_survival_server.py')
MOD=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MOD)

SOURCE=r"""
const SHOP_ARMOR=[{name:'Исследовательский',isResearchSuit:true}];
function parseGearNameServer(n){return {baseName:'Исследовательский',level:20}}
function pveArtifactTurnEffects(data) {
    let extraHunger=0, extraThirst=0, leak=0, radiationResist=0;
    const netLeak=Math.max(0,leak-radiationResist);
    if(netLeak>0){
        data.radiation=Math.min(100,(Number(data.radiation)||0)+netLeak);
        data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)*10)/10;
        if(data.radiation>=100) data.health=0;
    }
    return {extraHunger,extraThirst,netLeak};
}
function pveRadiationDamage(data) {
    const rad=Math.max(0,Number(data.radiation)||0);
    if(rad<=0) return 0;
    data.health=Math.round(Math.max(0,(Number(data.health)||0)-rad)*10)/10;
    return rad;
}
app.post('/api/raid/step',requireAuth,rateLimit('raid-step',20,10000),(req,res)=>{
    const data={maxHunger:100,hunger:100,maxThirst:100,thirst:100};
            data.hunger=Math.max(0,Math.min(Number(data.maxHunger)||100,(Number(data.hunger)||0)-5));
            data.thirst=Math.max(0,Math.min(Number(data.maxThirst)||100,(Number(data.thirst)||0)-5));
});
app.post('/api/raid/anomaly/search',requireAuth,rateLimit('raid-anomaly-search',10,10000),(req,res)=>{
            const a={name:'Жарка',tier:1},data={radiationResist:0,anomalyResist:{},armor:{name:'Исследовательский +20'},radiation:0,health:100},effLuck=0;
            const rawRad=86+Math.floor(Math.random()*8),radRes=Math.max(0,Number(data.radiationResist)||0);
            const radiationAdded=Math.max(0,rawRad-radRes);
            data.radiation=Math.min(100,(Number(data.radiation)||0)+radiationAdded);
            const specific=Number(data.anomalyResist&&data.anomalyResist[a.name])||0;
            const searchDmg=Math.max(0,radiationAdded-effLuck*0.5-Math.max(0,specific));
            data.health=Math.round(Math.max(0,(Number(data.health)||0)-searchDmg)*10)/10;
            if(data.radiation>=100)data.health=0;
            const anomalyDmg=Math.max(0,Number(a.tier)*4-specific);
            if(anomalyDmg>0)data.health=Math.round(Math.max(0,data.health-anomalyDmg)*10)/10;
            const turnEffects=pveArtifactTurnEffects(data);
            if(data.radiation>=100)data.health=0;
});
"""
patched,changed=MOD.patch(SOURCE)
assert changed
assert MOD.MARK in patched
assert '-2));' in patched and '-5));' not in patched
assert 'rad*0.15' in patched
assert 'searchDmg=0' in patched
assert 'pveAnomalyExposureServer' in patched
assert 'upgradeLevel*2.2' in patched
assert 'damage=[0,10,16,24,34,46,60,76,94,230]' in patched
assert 'artifactSpecific' in patched and 'artifactRadiation' in patched
assert 'data.health=Math.round(Math.max(0,(Number(data.health)||0)-netLeak)' not in patched
again,changed2=MOD.patch(patched)
assert not changed2 and again==patched

# The live server may already contain the previous V2 installer. It must upgrade in-place.
legacy=patched.replace(MOD.HELPER,MOD.OLD_HELPER).replace(
    "            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);\n            const exposure=pveAnomalyExposureServer(playerId,data,a);",
    "            const exposure=pveAnomalyExposureServer(data,a);"
)
assert MOD.OLD_MARK in legacy and MOD.MARK not in legacy
upgraded,upgrade_changed=MOD.patch(legacy)
assert upgrade_changed and MOD.MARK in upgraded and MOD.OLD_MARK not in upgraded
assert 'pveAnomalyExposureServer(playerId,data,a)' in upgraded
with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'server.js';p.write_text(patched,encoding='utf-8')
    subprocess.run(['node','--check',str(p)],check=True)
print('PASS: raid survival server patch')


# Regression: the installer health loop intentionally calls run(..., check=False).
# The wrapper must not inject a second check= argument.
probe=MOD.run(['python3','-c','import sys; sys.exit(3)'],check=False,capture_output=True)
assert probe.returncode==3
