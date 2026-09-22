#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_zone_map_routing_server.py'
spec=importlib.util.spec_from_file_location('zone_map_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

js=r"""
let playerData={level:999,inventory:{}};
const routes={};
const app={post(path,...fns){routes[path]=fns.at(-1)}};
const requireAuth=(_req,_res,next)=>next();
const rateLimit=()=> (_req,_res,next)=>next();
function safeParsePlayerData(raw){return JSON.parse(raw)}
function zoneMapLocationUnlocked(_data,location){return [1,2,3,4].includes(Number(location))}
const db={prepare(sql){
  if(sql.startsWith('SELECT data FROM players'))return{get(){return{data:JSON.stringify(playerData)}}};
  if(sql.startsWith('UPDATE players SET data='))return{run(raw){playerData=JSON.parse(raw);return{changes:1}}};
  throw new Error('Unexpected SQL '+sql);
}};
"""+mod.POSITION_ROUTE+r"""
function call(body){
  let out={code:200,body:null};
  const req={body,telegramUser:{id:'1'}};
  const res={status(code){out.code=code;return this},json(body){out.body=body;return body}};
  routes['/api/player/position'](req,res);
  return out;
}
let r=call({zoneLocation:4,place:'rostok-bar',origin:'rostok-bar'});
if(!r.body?.success||playerData.worldPosition.zoneLocation!==4||playerData.worldPosition.place!=='rostok-bar')throw Error('Rostok bar save failed');

r=call({zoneLocation:4,place:'warehouse',origin:'rostok-bar'});
if(!r.body?.success||playerData.worldPosition.zoneLocation!==4||playerData.worldPosition.origin!=='rostok-bar')throw Error('Rostok warehouse origin lost');

r=call({zoneLocation:4,place:'kpk',origin:'rostok-bar'});
if(playerData.worldPosition.zoneLocation!==4||playerData.worldPosition.origin!=='rostok-bar')throw Error('Rostok PDA origin lost');

r=call({zoneLocation:4,place:'zhuchara',origin:'zone-map'});
if(playerData.worldPosition.zoneLocation!==1||playerData.worldPosition.origin!=='cordon-camp')throw Error('Cordon trader not normalized');

r=call({zoneLocation:4,place:'smoker',origin:'zone-map'});
if(playerData.worldPosition.zoneLocation!==1||playerData.worldPosition.place!=='smoker'||playerData.worldPosition.origin!=='cordon-camp')throw Error('Cordon smoker position not preserved');

r=call({zoneLocation:4,place:'zone-map',origin:'zone-map'});
if(playerData.worldPosition.zoneLocation!==4||playerData.worldPosition.origin!=='zone-map')throw Error('Zone map location lost');

r=call({zoneLocation:4,place:'nonsense',origin:'rostok-bar'});
if(playerData.worldPosition.zoneLocation!==1||playerData.worldPosition.place!=='cordon-camp')throw Error('Invalid place not sanitized');

console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'position.js'
    candidate.write_text(js,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],capture_output=True,text=True)
    if proc.returncode:
        raise AssertionError(proc.stdout+'\n'+proc.stderr)
    assert 'RUNTIME PASS' in proc.stdout

source=path.read_text(encoding='utf-8')
assert mod.POSITION_MARK in mod.POSITION_ROUTE
assert "'warehouse'" in mod.POSITION_ROUTE
assert "updatedAt:Date.now()" in mod.POSITION_ROUTE

print('PASS: player world position persists map/bar/warehouse/PDA and normalizes physical locations')
