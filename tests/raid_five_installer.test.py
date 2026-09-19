from pathlib import Path
import tempfile,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from install_raid_five_update import deploy
with tempfile.TemporaryDirectory() as td:
    root=Path(td);(root/'server.js').write_bytes(b'old server');(root/'quest-balance.cjs').write_bytes(b'old quests');(root/'game.db').write_bytes(b'untouched DB')
    before={'server.js':b'old server','quest-balance.cjs':b'old quests'}
    new={'server.js':b'new server','quest-balance.cjs':b'new quests','raid-survival.cjs':b'new module'}
    calls=[]
    try:deploy(root,before,new,control=calls.append,probe=lambda:False,wait_seconds=0)
    except RuntimeError:pass
    else:raise AssertionError('startup failure must not report success')
    assert (root/'server.js').read_bytes()==b'old server'
    assert (root/'quest-balance.cjs').read_bytes()==b'old quests'
    assert not (root/'raid-survival.cjs').exists()
    assert (root/'game.db').read_bytes()==b'untouched DB'
    assert calls==['stop','start','stop','start']
print('PASS: code rollback after failed startup; DB and existing code preserved')
