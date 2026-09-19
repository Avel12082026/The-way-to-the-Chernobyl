from pathlib import Path
import sys, tempfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import install_artifact_selection_radiation as mod

SOURCE=r"""
const app={post(){},get(){},listen(){}};
function requireAuth(){}
function rateLimit(){return()=>{}}
app.post('/api/artifacts/breed',requireAuth,rateLimit('artifact-breed',10,10000),(req,res)=>{
    const a1={stats:{radiationLeak:-3,radiation:2},tier:2};
    const a2={stats:{radiation:4},tier:2};
    const resultTier=Math.max(a1.tier,a2.tier);
    const resultGen=2;
    const perStatCap=resultTier*10*Math.min(resultGen,20);
    const allKeys = new Set([...Object.keys(a1.stats), ...Object.keys(a2.stats)]);
    const mergedStats = {};
    allKeys.forEach(key => {
        const v1 = a1.stats[key] || 0;
        const v2 = a2.stats[key] || 0;
        if (v1 < 0 || v2 < 0) {
            const worse = Math.min(v1, v2);
            mergedStats[key] = worse >= -1 ? 1 : worse + 1;
        } else {
            mergedStats[key] = Math.min(Math.round(v1 + v2), perStatCap);
        }
    });
    return res.json({success:true,artifact:{stats:mergedStats}});
});
app.get('/api/market',(_req,res)=>res.json([]));
app.listen(3000,()=>{});
""".encode()

payload=ROOT/'server_patches/artifact-selection-radiation.cjs'

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    (root/'server.js').write_bytes(SOURCE)
    (root/'game.db').write_bytes(b'player progress must stay untouched')
    known=mod.KNOWN_SERVER_INPUTS
    mod.KNOWN_SERVER_INPUTS={mod.digest(SOURCE)}
    try:
        before,updates=mod.prepare(root,payload)
        assert before['server.js']==SOURCE
        assert mod.MARK.encode() in updates['server.js']
        assert b'ArtifactSelectionRadiation.mergeStats(a1.stats,a2.stats,{perStatCap})' in updates['server.js']
        assert mod.digest(updates[mod.MODULE_NAME])==mod.MODULE_HASH

        (root/'server.js').write_bytes(updates['server.js'])
        (root/mod.MODULE_NAME).write_bytes(updates[mod.MODULE_NAME])
        before2,updates2=mod.prepare(root,payload)
        assert updates2==updates
    finally:
        mod.KNOWN_SERVER_INPUTS=known
    assert (root/'game.db').read_bytes()==b'player progress must stay untouched'

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    (root/'server.js').write_bytes(b'old server')
    (root/mod.MODULE_NAME).write_bytes(b'old module')
    (root/'game.db').write_bytes(b'untouched DB')
    before={'server.js':b'old server'}
    updates={'server.js':b'new server',mod.MODULE_NAME:b'new module'}
    calls=[]
    try:
        mod.deploy(root,before,updates,control=calls.append,probe=lambda:False,wait_seconds=0)
    except RuntimeError:
        pass
    else:
        raise AssertionError('failed startup must roll code back')
    assert (root/'server.js').read_bytes()==b'old server'
    assert (root/mod.MODULE_NAME).read_bytes()==b'old module'
    assert (root/'game.db').read_bytes()==b'untouched DB'
    assert calls==['stop','start','stop','start']

print('PASS: artifact selection radiation installer prepare/idempotency and code-only rollback')
