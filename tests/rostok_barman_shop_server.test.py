#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_zone_map_routing_server.py'
spec=importlib.util.spec_from_file_location('zone_map_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

js=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({name:'P'+(i+1),progressionClass:'pistol',starterGear:i===0})),
 ...Array.from({length:29},(_,i)=>({name:'S'+(i+1),progressionClass:'shotgun'})),
 {name:'ADMIN',progressionClass:'shotgun',adminOnly:true}
];
const SHOP_ARMOR=Array.from({length:60},(_,i)=>({id:i+1,name:'A'+(i+1)}));
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
const okWeapon=call({vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'S1'});
if(!okWeapon.next)throw new Error('shotgun blocked');
const okLastWeapon=call({vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'S29'});
if(!okLastWeapon.next)throw new Error('last shotgun blocked');
const okArmor=call({vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A30 +3'});
if(!okArmor.next)throw new Error('armor 30 blocked');
const okLastArmor=call({vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A58'});
if(!okLastArmor.next)throw new Error('armor 58 blocked');
for(const name of ['Хлеб','Тушенка','Вода','Энергетик','Аптечка гражданская','Аптечка армейская','Аптечка научная','Антирад']){
  const r=call({vendor:'zhuchara',sourceVendor:'barman',category:'consumable',name});
  if(!r.next)throw new Error('Barman consumable blocked '+name);
}
for(const payload of [
 {vendor:'zhuchara',sourceVendor:'barman',category:'weapon',name:'P1'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A29'},
 {vendor:'zhuchara',sourceVendor:'barman',category:'armor',name:'A59'},
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


# Zhuchara armor must use stable IDs rather than array position. Reverse the
# server catalogue to reproduce the live-order mismatch that broke armor buys.
zhuchara_js=r"""
const SHOP_WEAPONS=Array.from({length:29},(_,i)=>({id:100+i,name:'P'+(i+1),progressionClass:'pistol',starterGear:i===0}));
const SHOP_ARMOR=Array.from({length:60},(_,i)=>({id:i+1,name:'A'+(i+1)})).reverse();
function parseGearNameServer(name){return {baseName:String(name).replace(/ \+\d+$/,'')};}
const handlers=[];
const app={post(path,...fns){if(path==='/api/shop/buy')handlers.push(...fns)}};
"""+mod.SHOP_GUARD+r"""
function call(body){
  let result={next:false,status:200,body:null};
  const req={body};
  const res={status(code){result.status=code;return this},json(body){result.body=body;return body}};
  handlers[0](req,res,()=>{result.next=true});
  return result;
}
for(const name of ['A1','A17','A29','A29 +3']){
  const r=call({vendor:'zhuchara',sourceVendor:'zhuchara',category:'armor',name});
  if(!r.next)throw new Error('Zhuchara armor blocked '+name+' '+JSON.stringify(r));
}
for(const name of ['A30','A58']){
  const r=call({vendor:'zhuchara',sourceVendor:'zhuchara',category:'armor',name});
  if(r.next||r.status!==400)throw new Error('out-of-range Zhuchara armor passed '+name);
}
console.log('ZHUCHARA ARMOR PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'zhuchara-armor.js'
    candidate.write_text(zhuchara_js,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],capture_output=True,text=True)
    if proc.returncode:
        raise AssertionError(proc.stdout+'\\n'+proc.stderr)
    assert 'ZHUCHARA ARMOR PASS' in proc.stdout


technician_js=r"""
const handlers=[];
const app={post(path,...fns){if(path==='/api/shop/buy')handlers.push(...fns)}};
"""+mod.TECHNICIAN_BUY_ALIAS+r"""
function call(body){
  const req={body};
  let next=false;
  handlers[0](req,{},()=>{next=true});
  return {body:req.body,next};
}
let r=call({vendor:'technician',sourceVendor:'technician',category:'detector',name:'РИПЕР'});
if(!r.next||r.body.vendor!=='leonov')throw new Error('technician detector buy was not routed to server detector validation');
r=call({vendor:'technician',sourceVendor:'technician',category:'armor',name:'A1'});
if(!r.next||r.body.vendor!=='technician')throw new Error('technician non-detector buy must not be rewritten');
r=call({vendor:'zhuchara',sourceVendor:'zhuchara',category:'detector',name:'РИПЕР'});
if(!r.next||r.body.vendor!=='zhuchara')throw new Error('other vendors must not be rewritten');
console.log('TECHNICIAN BUY PASS');
"""
with tempfile.TemporaryDirectory() as td:
    candidate=Path(td)/'technician-buy.js'
    candidate.write_text(technician_js,encoding='utf-8')
    proc=subprocess.run(['node',str(candidate)],capture_output=True,text=True)
    if proc.returncode:
        raise AssertionError(proc.stdout+'\\n'+proc.stderr)
    assert 'TECHNICIAN BUY PASS' in proc.stdout

print('PASS: stable-ID Zhuchara/Barman armor ranges, Barman stock validation and Diesel detector purchases')
