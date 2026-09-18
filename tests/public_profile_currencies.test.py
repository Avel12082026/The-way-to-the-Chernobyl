import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('p',ROOT/'tools/install_public_profile_currencies.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
src="""app.get('/api/player/:id',(req,res)=>{ const data = {
        nickname: full.nickname, username: row.username,
        level: Number(full.level)||1,
        stats: full.stats || {},
};});"""
patched,changed=p.patch(src)
assert changed
assert 'coins: Number(full.coins)||0' in patched
assert 'breedCredits: Number(full.breedCredits)||0' in patched
again,changed2=p.patch(patched)
assert not changed2 and again==patched
print('public profile currencies patch: OK')
