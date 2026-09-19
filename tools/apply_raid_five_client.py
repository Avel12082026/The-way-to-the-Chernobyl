#!/usr/bin/env python3
"""Materialize reviewed, anchor-guarded changes in an isolated repository worktree."""
from pathlib import Path
import re
VERSION='20260920-five1'
MARK='RAID_FIVE_20260920_V1'
def once(s,old,new):
    if s.count(old)!=1:raise ValueError('Expected one anchor: '+old[:110])
    return s.replace(old,new,1)
def patch_server_quests(s):
    if MARK in s:return s
    s=once(s,"    q.activeId=q.accepted.some(x=>x.id===q.activeId)?q.activeId:null;", """    const acceptedIds=new Set(q.accepted.map(x=>x.id));
    const active=Array.isArray(q.activeIds)?q.activeIds:(q.activeId?[q.activeId]:[]);
    q.activeIds=[...new Set(active)].filter(id=>typeof id==='string'&&acceptedIds.has(id));
    q.activeId=q.activeIds[0]||null; // Compatibility with older clients.
""".rstrip())
    s=once(s,'activeId:q.activeId,','activeId:q.activeId,activeIds:[...q.activeIds],')
    s=once(s,"    if(!q.accepted.some(x=>x.id===body.questId))throw new Error('Задание не найдено');\n    if(q.activeId!==body.questId){q.activeId=body.questId;save(id,data);}", """    const ids=Array.isArray(body.questIds)?body.questIds:[body.questId];
    if(!ids.length||ids.length>MAX_ACCEPTED||ids.some(id=>typeof id!=='string'||!q.accepted.some(x=>x.id===id)))
      throw new Error('Задание не найдено');
    q.activeIds=[...new Set([...q.activeIds,...ids])];
    q.activeId=q.activeIds[0]||null;save(id,data);""")
    s=once(s,"  endpoint('/abandon',", """  endpoint('/deactivate',(id,body)=>db.transaction(()=>{
    const data=load(id),q=normalizeQuestState(data);
    if(!q.accepted.some(x=>x.id===body.questId))throw new Error('Задание не найдено');
    q.activeIds=q.activeIds.filter(x=>x!==body.questId);
    q.activeId=q.activeIds[0]||null;save(id,data);
    return publicState(id,data);
  })());
  endpoint('/abandon',""")
    old="q.accepted=q.accepted.filter(x=>x.id!==quest.id);if(q.activeId===quest.id)q.activeId=null;"
    if s.count(old)!=2:raise ValueError('Quest removal anchors')
    s=s.replace(old,"q.accepted=q.accepted.filter(x=>x.id!==quest.id);q.activeIds=q.activeIds.filter(id=>id!==quest.id);q.activeId=q.activeIds[0]||null;")
    s=once(s,"balanceVersion:'2026-09-19-review'","balanceVersion:'20260920-five1',multiActive:true")
    return s+'\n// '+MARK+'\n'
def patch_client_quests(s):
    if MARK in s:return s
    s=once(s,'let state={accepted:[],activeId:null,completed:[]','let state={accepted:[],activeId:null,activeIds:[],multiActive:false,completed:[]')
    s=once(s,'function activeQuest(){return state.accepted.find(q=>q.id===state.activeId)||null;}',"""function isActive(id){return state.activeIds.includes(id);}
function activeQuests(){return state.activeIds.map(id=>state.accepted.find(q=>q.id===id)).filter(Boolean);}
function activeQuest(){return activeQuests()[0]||null;}""")
    s=once(s,'  state={accepted:data.accepted,activeId:data.activeId||null,completed:data.completed,',"""  const valid=new Set(data.accepted.map(q=>q.id));
  const activeIds=[...new Set(Array.isArray(data.activeIds)?data.activeIds:(data.activeId?[data.activeId]:[]))].filter(id=>valid.has(id));
  state={accepted:data.accepted,activeId:activeIds[0]||null,activeIds,multiActive:Array.isArray(data.activeIds),completed:data.completed,""")
    s=s.replace("mode==='accepted'&&q.id!==state.activeId","mode==='accepted'&&!isActive(q.id)")
    s=once(s,"${mode!=='completed'&&q.id===state.activeId?'<p class=\"quest-priority\">Приоритетное задание</p>':''}","""${mode!=='completed'&&isActive(q.id)?'<p class="quest-priority">Активное задание</p>':''}
   ${mode!=='completed'&&isActive(q.id)&&state.multiActive?'<button type="button" data-write-action="deactivate" data-quest-action="deactivate" data-quest-id="'+esc(q.id)+'">Деактивировать</button>':''}""")
    s=once(s,"if(activeTab==='accepted')rows=state.accepted.filter(q=>q.id!==state.activeId);\n  else if(activeTab==='active'){const q=activeQuest();rows=q?[q]:[];}","if(activeTab==='accepted')rows=state.accepted.filter(q=>!isActive(q.id));\n  else if(activeTab==='active')rows=activeQuests();")
    s=s.replace('Приоритетное задание не выбрано.','Активных заданий нет.')
    s=once(s,"  rows.forEach(q=>list.append(questCard(q,activeTab)));", """  if(activeTab==='accepted'&&rows.length>1&&state.multiActive){
    const all=document.createElement('button');all.type='button';all.dataset.writeAction='activate-all';
    all.dataset.questAction='activate-all';all.textContent='Активировать все взятые';list.append(all);
  }
  rows.forEach(q=>list.append(questCard(q,activeTab)));""")
    a=s.index('function renderTracker(){');b=s.index('function renderAll()',a)
    s=s[:a]+"""function renderTracker(){
  ensureTracker();
  const rows=activeQuests();
  if(!rows.length||!tracker.isConnected){tracker.hidden=true;return;}
  const signature=JSON.stringify(rows.map(q=>[q,haveQty(q.itemName,q.baseOnly)]));
  if(signature===trackerSignature&&!tracker.hidden)return;trackerSignature=signature;
  const scroll=tracker.scrollTop;
  tracker.hidden=false;tracker.className=rows.every(completeNow)?'quest-ready':'';
  tracker.innerHTML=rows.map(q=>`<article class="raid-quest-entry raid-quest-track-item${completeNow(q)?' quest-ready':''}" data-quest-id="${esc(q.id)}"><strong>Задание: ${esc(q.title||q.itemName)}</strong><span class="quest-objective">${esc(objective(q))}</span><span>Отнести: ${esc(vendorName(q.vendor))}</span></article>`).join('');
  tracker.scrollTop=scroll;
}
"""+s[b:]
    s=once(s,'async function fetchOffers(vendor){',"""async function activateAll(){
  const questIds=state.accepted.filter(q=>!isActive(q.id)).map(q=>q.id);
  if(!questIds.length)return;
  return write('/activate',{questIds},()=>{activeTab='active';selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;});
}
async function deactivate(id){return write('/deactivate',{questId:id},()=>{selectedDetails=null;document.getElementById('questPdaDetails').hidden=true;});}
async function fetchOffers(vendor){""")
    s=once(s,"  else if(b.dataset.questAction==='activate')activate(b.dataset.questId);", """  else if(b.dataset.questAction==='activate')activate(b.dataset.questId);
  else if(b.dataset.questAction==='activate-all')activateAll();
  else if(b.dataset.questAction==='deactivate')deactivate(b.dataset.questId);""")
    s=s.replace("version:'1.2.1'","version:'1.3.0'")
    s=s.replace('ui/quests.css?v=20260919-3','ui/quests.css?v='+VERSION)
    return s+'\n// '+MARK+'\n'
def patch_css(s):
    if MARK in s:return s
    s=once(s,'#raidMetersRow>div>div:first-child{display:none!important}', '#raidMetersRow>.raid-radiation-wrapper>.raid-radiation-label{display:none!important}')
    s=once(s,'#activeQuestRaidTracker{margin:4px 0 0!important;flex:0 0 auto;max-height:72px;overflow:hidden}', '#activeQuestRaidTracker{margin:4px 0 0!important;flex:0 0 auto;max-height:72px;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;touch-action:pan-y;display:block;scrollbar-width:thin}')
    s+='''\n/* '''+MARK+''' */
#raidExpTrack>.expBarFill{display:block!important;visibility:visible!important;opacity:1!important;z-index:0}
#raidScreen #activeQuestRaidTracker:not([hidden]){display:block!important}
#activeQuestRaidTracker .raid-quest-entry{display:grid;gap:2px}
#activeQuestRaidTracker .raid-quest-entry+.raid-quest-entry{margin-top:6px;padding-top:6px;border-top:1px solid #65583c}
#activeQuestRaidTracker .raid-quest-entry.quest-ready .quest-objective{color:#6fe17b!important}
.item-reference{display:grid;gap:5px;margin:8px 0;padding:8px;border:1px solid #65583c;background:#10140e;color:#d5c9a8;font:13px/1.45 Arial,sans-serif}
.item-reference .item-reference-level{font-weight:700;color:#dfca84}
.item-reference .item-reference-market{font-size:12px;color:#b5b29f}
'''
    return s
def apply(root):
    root=Path(root)
    changes={}
    def change(path,fn):
        s=(root/path).read_text(encoding='utf-8');new=fn(s)
        if new!=s:changes[path]=new
    change('server_patches/quest-balance.cjs',patch_server_quests)
    change('ui/quests.js',patch_client_quests)
    change('ui/raid-kpk-polish.css',patch_css)
    def raid_js(s):
        if MARK in s:return s
        s=once(s,"  const radiation=document.getElementById('raidRadiationTrack')?.parentElement;", """  const radiation=document.getElementById('raidRadiationTrack')?.parentElement;
  radiation?.classList.add('raid-radiation-wrapper');
  if(radiation?.firstElementChild?.id!=='raidRadiationTrack')radiation?.firstElementChild?.classList.add('raid-radiation-label');""")
        return s.replace("version:'1.3.5'","version:'1.4.0'")+'\n// '+MARK+'\n'
    change('ui/raid-kpk-polish.js',raid_js)
    change('ui/trader-hubs.js',lambda s:s.replace('ui/quests.js?v=20260919-3','ui/quests.js?v='+VERSION))
    def index(s):
        if MARK in s:return s
        for path in ['ui/trader-hubs.js','ui/raid-kpk-polish.js','ui/raid-kpk-polish.css']:
            s,n=re.subn(re.escape(path)+r'\?v=[^"\s<>]+',path+'?v='+VERSION,s)
            if n!=1:raise ValueError('Cache anchor '+path)
        s=once(s,'</body>','<!-- '+MARK+' -->\n<script src="ui/item-reference.js?v='+VERSION+'"></script>\n</body>')
        return s
    change('index.html',index)
    change('tests/quests.browser.py',lambda s:s.replace("QuestSystem?.version==='1.2.1'","QuestSystem?.version==='1.3.0'"))
    change('tests/raid_pda_five.static.cjs',lambda s:s.replace('20260919r8',VERSION))
    # All anchors are checked before any file is modified.
    for path,new in changes.items():
        (root/path).write_text(new,encoding='utf-8');print('Updated',path)
if __name__=='__main__':
    apply(Path(__file__).resolve().parents[1])
