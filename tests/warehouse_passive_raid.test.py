#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_warehouse_passive_raid_fix.py'
spec=importlib.util.spec_from_file_location('warehouse_fix',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

source=r"""
const db={prepare(sql){return{get(){return null}}}};
"""+mod.OLD+r"""
app.listen(3000);
"""
patched,changed=mod.patch(source)
assert changed and mod.NEW in patched
again,changed2=mod.patch(patched)
assert not changed2 and again==patched

runtime=r"""
const state={raid:null,battle:false};
const db={prepare(sql){
  if(sql.startsWith('SELECT 1 FROM pve_battles'))return{get(){return state.battle?{1:1}:undefined}};
  if(sql.startsWith('SELECT pending_type FROM raid_sessions'))return{get(){return state.raid===undefined||state.raid===null?undefined:{pending_type:state.raid}}};
  return{get(){return undefined}};
}};
"""+mod.NEW+r"""
function expect(label,raid,battle,want){
  state.raid=raid;state.battle=battle;
  const got=isPlayerInActiveRaidServer('1');
  if(got!==want)throw new Error(label+': '+got+' !== '+want);
}
expect('no raid',null,false,false);
expect('passive completed raid',null,false,false);
state.raid='';
if(isPlayerInActiveRaidServer('1')!==false)throw new Error('empty pending_type must be passive');
expect('pending anomaly','anomaly',false,true);
expect('pending battle marker','battle',false,true);
expect('active pve battle',null,true,true);
console.log('PASS');
"""
with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'test.js';p.write_text(runtime,encoding='utf-8')
    proc=subprocess.run(['node',str(p)],capture_output=True,text=True)
    if proc.returncode:
        raise AssertionError(proc.stdout+'\n'+proc.stderr)
    assert 'PASS' in proc.stdout
print('PASS: passive completed raid no longer blocks warehouse, active encounters still do')
