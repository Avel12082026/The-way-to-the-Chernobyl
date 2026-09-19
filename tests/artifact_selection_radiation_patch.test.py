from pathlib import Path
import importlib.util, tempfile, subprocess

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('selection_patch',ROOT/'tools/patch_artifact_selection_radiation.py')
MOD=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(MOD)

SOURCE=r"""
const app={};
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
"""

patched=MOD.build(SOURCE)
assert MOD.MARK in patched
assert MOD.REQUIRE in patched
assert MOD.VERSION_ROUTE in patched
assert "ArtifactSelectionRadiation.mergeStats(a1.stats,a2.stats,{perStatCap})" in patched
assert "worse >= -1 ? 1" not in patched
assert patched.count("app.post('/api/artifacts/breed'")==1
assert MOD.build(patched)==patched

# A route with an unreviewed merge shape must fail closed instead of guessing.
BROKEN=SOURCE.replace('const allKeys = new Set([...Object.keys(a1.stats), ...Object.keys(a2.stats)]);','const keys = Object.keys(a1.stats);')
try:
    MOD.build(BROKEN)
except ValueError as exc:
    assert 'Ничего не изменено' in str(exc)
else:
    raise AssertionError('unreviewed breed route shape must be rejected')

with tempfile.TemporaryDirectory() as td:
    root=Path(td)
    (root/'artifact-selection-radiation.cjs').write_text(
        (ROOT/'server_patches/artifact-selection-radiation.cjs').read_text(encoding='utf-8'),
        encoding='utf-8'
    )
    server=root/'server.js'
    server.write_text(patched,encoding='utf-8')
    subprocess.run(['node','--check',str(server)],check=True)

print('PASS: guarded artifact selection radiation patch and idempotency')
