#!/usr/bin/env python3
import importlib.util, subprocess, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'tools/install_zone_map_routing_server.py'
spec=importlib.util.spec_from_file_location('zone_map_installer',path)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

js=r"""
const SHOP_WEAPONS=[
 ...Array.from({length:29},(_,i)=>({name:'A'+(i+1),progressionClass:'automatic'})),
 ...Array.from({length:29},(_,i)=>({name:'S'+(i+1),progressionClass:'shotgun'}))
];
const SHOP_ARMOR=[
 ...Array.from({length:58},(_,i)=>({id:i+1,name:'B'+(i+1)})),
 ...Array.from({length:22},(_,i)=>({id:59+i,name:'Y'+(i+1)})),
 {id:81,name:'PREM1',isPremiumArmor:true},{id:82,name:'PREM2',isPremiumArmor:true},
 {id:83,name:'PREM3',isPremiumArmor:true},{id:84,name:'PREM4',isPremiumArmor:true},
 {id:85,name:'ADMIN',adminOnly:true},
 ...Array.from({length:7},(_,i)=>({id:86+i,name:'R'+(i+1),isResearchSuit:true}))
];
function parseGearNameServer(name){return{baseName:name.replace(/ \+\d+$/,'')}}
const handlers=[];
const app={post(path,...fns){if(path==='/api/shop/buy')handlers.push(...fns)}};
"""+mod.YANTAR_LEONOV_GUARD+r"""
function call(body){
  const req={body:{...body}},out={code:200,next:false};
  const res={status(n){out.code=n;return this},json(x){out.body=x;return x}};
  handlers[0](req,res,()=>{out.next=true});
  return {body:req.body,...out};
}
let r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'weapon',name:'A1'});
if(!r.next||r.body.vendor!=='zhuchara')throw Error('Yantar automatic not routed');
r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'weapon',name:'S1'});
if(r.code!==400||r.next)throw Error('wrong weapon class allowed');
r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'armor',name:'Y22'});
if(!r.next||r.body.vendor!=='zhuchara')throw Error('Yantar regular suit not routed');
r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'armor',name:'R7'});
if(!r.next||r.body.vendor!=='leonov')throw Error('Yantar research suit must stay on Leonov validation');
for(const name of ['PREM1','ADMIN']){
  r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'armor',name});
  if(r.code!==400||r.next)throw Error('special armor leaked: '+name);
}
r=call({vendor:'leonov',sourceVendor:'leonov-yantar',category:'consumable',name:'Антирад'});
if(!r.next||r.body.vendor!=='leonov')throw Error('Leonov consumable route changed');
console.log('PASS');
"""

with tempfile.TemporaryDirectory() as td:
    p=Path(td)/'test.js';p.write_text(js,encoding='utf-8')
    proc=subprocess.run(['node',str(p)],capture_output=True,text=True)
    if proc.returncode: raise AssertionError(proc.stdout+'\n'+proc.stderr)
    assert 'PASS' in proc.stdout
print('PASS: Yantar Leonov server allows only the next 29 automatic weapons and 29 safe suits')
