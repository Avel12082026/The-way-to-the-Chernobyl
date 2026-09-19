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
        assert b'artifactAnomaly:beltHazard.anomaly' in updates['server.js']
        assert mod.digest(updates['raid-survival.cjs'])==mod.MODULE_HASH

        (root/'server.js').write_bytes(updates['server.js'])
        (root/'raid-survival.cjs').write_bytes(updates['raid-survival.cjs'])
        before2,updates2=mod.prepare(root,payload)
        assert updates2['server.js']==updates['server.js']
        assert updates2['raid-survival.cjs']==updates['raid-survival.cjs']
    finally:
        mod.KNOWN_SERVER_INPUTS=known

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

print('PASS: anomaly V3 prepare/idempotency and code-only rollback; DB preserved')
