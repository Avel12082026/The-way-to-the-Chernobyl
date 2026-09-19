from pathlib import Path
import json, shutil, sys, tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install_raid_anomaly_v3_update as mod

fixture=json.loads((ROOT/'tests/fixtures/raid-survival-live.json').read_text(encoding='utf-8'))
payload=ROOT/'server_patches/raid-survival.cjs'

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    source=fixture['source'].encode('utf-8')
    (root/'server.js').write_bytes(source)
    (root/'game.db').write_bytes(b'gameplay progress must stay untouched')

    known=mod.KNOWN_SERVER_INPUTS
    mod.KNOWN_SERVER_INPUTS={mod.digest(source)}
    try:
        before,updates=mod.prepare(root,payload)
        assert before['server.js']==source
        assert mod.MARK.encode() in updates['server.js']
        assert b'artifactRadiation:beltHazard.radiationProtection' in updates['server.js']
        assert b'Math.abs(Number(st.radiationLeak)||0)' in updates['server.js']
        assert mod.digest(updates['raid-survival.cjs'])==mod.MODULE_HASH

        (root/'server.js').write_bytes(updates['server.js'])
        (root/'raid-survival.cjs').write_bytes(updates['raid-survival.cjs'])
        before2,updates2=mod.prepare(root,payload)
        assert updates2['server.js']==updates['server.js']
        assert updates2['raid-survival.cjs']==updates['raid-survival.cjs']
    finally:
        mod.KNOWN_SERVER_INPUTS=known

# Regression for the exact failure seen on an already-installed 20260920.2 server:
# the /api/raid/step handler may not have pveRadiationDamage(data) immediately after
# pveArtifactTurnEffects(data). The V2 -> V3 upgrade must still insert the recompute
# into the raid-step handler without touching the anomaly-search call site.
v3_source=mod.build(fixture['source'])
import patch_raid_survival as patch
v2_source=(v3_source
    .replace(patch.MARK,patch.OLD_MARK_V2,1)
    .replace(patch.BELT_HELPER,patch.BELT_HELPER_V2,1)
    .replace(patch.NEW_HAZARD_CALL,patch.V2_HAZARD_CALL,1)
    .replace(patch.TURN_EFFECTS_V3,patch.TURN_EFFECTS_V2,1)
    .replace("            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);\n            const turnEffects=pveArtifactTurnEffects(data);",
             "            const turnEffects=pveArtifactTurnEffects(data);",1))
step_old="            const turnEffects=pveArtifactTurnEffects(data);\n            const radiationDamage=pveRadiationDamage(data);"
step_variant="            const turnEffects=pveArtifactTurnEffects(data);\n            const radiationDamage=RaidSurvival.radiationDamage(data);"
assert step_old in v2_source
v2_source=v2_source.replace(step_old,step_variant,1)
upgraded_variant=mod.build(v2_source)
step_new="            if(typeof serverRecomputeArtifactDerived==='function')serverRecomputeArtifactDerived(playerId,data);\n            const turnEffects=pveArtifactTurnEffects(data);"
assert step_new in upgraded_variant
assert patch.MARK in upgraded_variant and patch.OLD_MARK_V2 not in upgraded_variant
assert upgraded_variant.count(step_new)==1

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    (root/'server.js').write_bytes(b'old server')
    (root/'raid-survival.cjs').write_bytes(b'old module')
    (root/'game.db').write_bytes(b'untouched DB')
    before={'server.js':b'old server'}
    updates={'server.js':b'new server','raid-survival.cjs':b'new module'}
    calls=[]
    try:
        mod.deploy(root,before,updates,control=calls.append,probe=lambda:False,wait_seconds=0)
    except RuntimeError:
        pass
    else:
        raise AssertionError('startup failure must roll code back')
    assert (root/'server.js').read_bytes()==b'old server'
    assert (root/'raid-survival.cjs').read_bytes()==b'old module'
    assert (root/'game.db').read_bytes()==b'untouched DB'
    assert calls==['stop','start','stop','start']

print('PASS: anomaly V3 prepare/idempotency, radiation split and code-only rollback; DB preserved')
