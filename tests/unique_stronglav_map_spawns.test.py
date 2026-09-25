#!/usr/bin/env python3
"""Exercise actual map selection against the full catalog and tier gaps."""
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('zone_map',ROOT/'tools/install_zone_map_routing_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
start=mod.ZONE_ROUTE.index('function zoneMapMutantPayload(data,zoneTier){')
end=mod.ZONE_ROUTE.index("app.post('/api/raid/zone-step'",start)
selector=mod.ZONE_ROUTE[start:end]
assert mod.UNIQUE_MUTANT_GUARD in selector
old_selector=selector.replace(mod.UNIQUE_MUTANT_GUARD,'')

# An installed V4 selector upgrades in place and remains idempotent. The full
# roster and unrelated legacy selector bytes are not touched.
legacy="function raidCreateMutantPayload(data){return 'unchanged legacy';}\n"
old=legacy+mod.ZONE_ROUTE.replace(mod.UNIQUE_MUTANT_GUARD,'')
upgraded,changed=mod.exclude_unique_map_mutants(old)
assert changed and upgraded==legacy+mod.ZONE_ROUTE
again,changed=mod.exclude_unique_map_mutants(upgraded)
assert again==upgraded and not changed
try:
    mod.exclude_unique_map_mutants(old.replace('    let pool=[];','    const candidates=[];'))
except RuntimeError:
    pass
else:
    raise AssertionError('Unsupported live selector must fail before any write')

runtime=r"""
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const roster=vm.runInNewContext(html.match(/const mutants = (\[[\s\S]*?\n    \]);/)[1]);
const before=JSON.stringify(roster);
const reserved=m=>m&&['стронглав','самка стронглава'].includes(m.name.toLowerCase());
function create(source,list){
 const math=Object.create(Math);math.random=()=>0;
 return {math,pick:new Function('PVE_MUTANTS','Math',source+';return zoneMapMutantPayload;')(list,math)};
}
const current=create(__CURRENT_SOURCE__,roster),old=create(__PREVIOUS_SOURCE__,roster),seen=new Set();
for(let tier=1;tier<=35;tier++){
 const sourceTiers=[...new Set(roster.filter(m=>!m.adminOnly).map(m=>Number(m.tier)||0).filter(t=>t>1))].sort((a,b)=>a-b);
 const sourceTier=tier<=1?null:sourceTiers[Math.min(sourceTiers.length-1,tier-2)];
 const originalPool=roster.filter(m=>!m.adminOnly&&(tier<=1?[0,1].includes(Number(m.tier)||0):(Number(m.tier)||0)===sourceTier));
 const allowed=originalPool.filter(m=>!reserved(m));
 for(let sample=0;sample<200;sample++){
  current.math.random=old.math.random=()=>sample/200;
  const actual=current.pick({},tier),previous=old.pick({},tier);
  if(!allowed.length){assert.equal(actual,null);continue;}
  assert.ok(actual&&!reserved(actual));
  assert.ok(allowed.some(m=>m.name===actual.name));
  assert.equal(actual.tier,tier);
  if(tier>1)assert.equal(actual.sourceTier,sourceTier,'Removing a unique mutant must not shift later tiers');
  if(!originalPool.some(reserved))assert.deepEqual(actual,previous,'All unaffected spawn outcomes/stats remain identical');
  seen.add(actual.name);
 }
}
assert.equal(roster.length,57);assert.equal(roster.filter(reserved).length,2);
assert.equal(JSON.stringify(roster),before,'Original catalog remains intact for explicit future quest use');
for(const m of roster.filter(m=>!m.adminOnly&&!reserved(m)))assert.ok(seen.has(m.name),m.name+' remains encounterable');
const gap=create(__CURRENT_SOURCE__,[{name:'Стронглав',tier:2,hp:500},{name:'Химера',tier:3,hp:600}]);
assert.equal(gap.pick({},2),null,'A tier containing only a unique mutant yields no ordinary encounter');
assert.equal(gap.pick({},3).name,'Химера','Next tier remains where it was');
console.log('PASS: both Stronglav names excluded from ordinary map rolls; all 55 other catalog entries retain routing/stats; catalog and explicit access preserved');
"""
runtime=runtime.replace('__CURRENT_SOURCE__',json.dumps(selector)).replace('__PREVIOUS_SOURCE__',json.dumps(old_selector))
subprocess.run(['node','-e',runtime],cwd=ROOT,check=True)
