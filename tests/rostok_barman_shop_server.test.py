#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_zone_map_routing_server.py'
spec=importlib.util.spec_from_file_location('zone_map_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

js=r"""
const SHOP_WEAPONS=[
 {name:'W3',tier:3},{name:'W4',tier:4},{name:'W8',tier:8},{name:'ADMIN',tier:14,adminOnly:true}
];
const SHOP_ARMOR=[
 {name:'A2',tier:2},{name:'A4',tier:4},{name:'A7',tier:7}
];
function parseGearNameServer(name){return {baseName:String(name).replace(/ \+\d+$/,'')};}
const handlers=[];
const app={post(path,...fns){if(path==='/api/shop/buy')handlers.push(...fns)}};
"""+mod.BARMAN_GUARD+r"""
function call(body){
  let result={next:false,status:200,body:null};
  const req={body};
  const res={
    status(code){result.status=code;return this},
    json(body){result.body=body;return body}
  };
  handlers[0](req,res,()=>{result.next=true});
  return result;
}
const okWeapon=call({vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'W4'});
if(!okWeapon.next)throw new Error('tier4 weapon blocked');
const okArmor=call({vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A7 +3'});
if(!okArmor.next)throw new Error('upgraded tier7 armor blocked');
for(const name of ['Хлеб','Тушенка','Вода','Энергетик','Аптечка гражданская','Аптечка армейская','Аптечка научная','Антирад']){
  const r=call({vendor:'zhuchara',sourceVendor:'barman',category:'consumable',name});
  if(!r.next)throw new Error('Barman consumable blocked '+name);
}
for(const payload of [
 {vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'W3'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A2'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'consumable',name:'Неизвестный припас'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'detector',name:'D1'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'ADMIN'}
]){
  const r=call(payload);
  if(r.next||r.status!==400)throw new Error('invalid Barman stock passed '+JSON.stringify(payload));
}
const normal=call({vendor:'zhuchara',category:'armor',name:'A2'});
if(!normal.next)throw new Error('normal Zhuchara request was intercepted');
console.log('RUNTIME PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'barman.js'
    candidate.write_text(js,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],capture_output=True,text=True)
    if proc.returncode:
        raise AssertionError(proc.stdout+'\n'+proc.stderr)
    assert 'RUNTIME PASS' in proc.stdout

print('PASS: Barman accepts Zhuchara consumables plus weapon/armor tier 4+ and leaves normal Zhuchara traffic untouched')
