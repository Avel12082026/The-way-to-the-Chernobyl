(()=>{
'use strict';
let screen, gesture=null, ghost=null, frame=0, busy=false, suppressUntil=0, preciseArtifacts=false;
const instruction='Зажми предмет и перетащи в подсвеченный слот. Короткое касание — информация.';
function hint(text=instruction){const el=document.getElementById(screen?.id==='warehouseScreen'?'warehouseDragHint':'inventoryDragHint');if(el)el.textContent=text;}
function kind(name){return getEquipSlotType(name)||(findArtifactDef(name)?'artifact':consumables.some(c=>c.name===name)?'quick':null);}
function compatible(name,slot,from=gesture?.from||'inventory'){
 if(!slot)return false;
 if(['deposit','withdraw'].includes(slot.dataset.dropKind))return !raidActive&&!inventoryOpenedFromRaid&&((slot.dataset.dropKind==='deposit'&&from==='inventory')||(slot.dataset.dropKind==='withdraw'&&from==='warehouse'));
 if(from!=='inventory')return false;
 if(!slot||kind(name)!==slot.dataset.dropKind)return false;
 if(slot.dataset.dropKind==='quick'&&currentEnemy&&!isFriendlyEncounterActive)return false;
 if(slot.dataset.dropKind==='artifact'&&!preciseArtifacts)return Number(slot.dataset.dropIndex)===player.artifactSlots.findIndex(x=>!x);
 return true;
}
function refresh(items){
 if(!screen)return;
 [...document.getElementById('inventoryGrid').children].forEach((cell,i)=>{if(items[i]){cell.dataset.dragItem=items[i];cell.querySelectorAll('img,a').forEach(el=>{el.draggable=false;el.removeAttribute('href');});}});
 [...document.getElementById('quickSlotsGrid').children].forEach((cell,i)=>{cell.dataset.dropKind=i<3?['weapon','armor','detector'][i]:'quick';if(i>=3)cell.dataset.dropIndex=i-3;});
 [...document.getElementById('artifactSlotsGrid').children].forEach((cell,i)=>{cell.dataset.dropKind='artifact';cell.dataset.dropIndex=i;});
}
function refreshWarehouse(items,invItems){
 const groups=[['warehouseGrid',items,'warehouse','deposit'],['warehouseInventoryGrid',invItems,'inventory','withdraw']];
 groups.forEach(([id,names,from,to])=>{const grid=document.getElementById(id);grid.dataset.dropKind=to;
 [...grid.children].forEach((cell,i)=>{if(!names[i])return;cell.dataset.dragItem=names[i];cell.dataset.dragFrom=from;cell.querySelectorAll('img,a').forEach(el=>{el.draggable=false;el.removeAttribute('href');});});});
}
function targetAt(x,y){return document.elementFromPoint(x,y)?.closest('[data-drop-kind]');}
function paint(){
 if(!gesture?.active)return;
 const g=gesture;ghost.style.transform=`translate(${g.x-27}px,${g.y-65}px)`;
 screen.querySelectorAll('[data-drop-kind]').forEach(s=>{s.classList.toggle('drag-valid',compatible(g.name,s));s.classList.remove('drag-over','drag-invalid');});
 const target=targetAt(g.x,g.y);if(target)target.classList.add(compatible(g.name,target)?'drag-over':'drag-invalid');
 // Scroll the inventory's actual scroll container while holding at its edge.
 const box=g.scroller===document.scrollingElement?{top:0,bottom:innerHeight}:g.scroller.getBoundingClientRect();
 const speed=g.y<box.top+60?-10:g.y>box.bottom-60?10:0;
 if(speed)g.scroller.scrollTop+=speed;
 frame=requestAnimationFrame(paint);
}
function begin(){
 if(!gesture||gesture.scrolling||busy)return;
 gesture.active=true;suppressUntil=Date.now()+700;
 ghost=document.createElement('div');ghost.className='inventory-drag-ghost';ghost.innerHTML=gesture.source.innerHTML;ghost.setAttribute('aria-hidden','true');document.body.append(ghost);
 hint('Отпусти предмет над подходящим слотом. Вне слотов — отмена.');paint();
}
function cleanup(){
 if(gesture)clearTimeout(gesture.timer);
 cancelAnimationFrame(frame);ghost?.remove();ghost=null;
 screen.querySelectorAll('.drag-valid,.drag-over,.drag-invalid').forEach(s=>s.classList.remove('drag-valid','drag-over','drag-invalid'));
 gesture=null;
}
async function drop(name,slot,from='inventory'){
 if(busy||!((from==='warehouse'?player.warehouse:player.inventory)[name]>0))return;
 if(!compatible(name,slot,from)){hint(slot?.dataset.dropKind==='artifact'&&!preciseArtifacts?'Для выбора любого слота артефакта требуется обновление сервера. Пока доступен первый свободный.':'Этот предмет не подходит для выбранного слота.');return;}
 busy=true;screen.setAttribute('aria-busy','true');hint('Перемещаю предмет…');
 try{
  const type=slot.dataset.dropKind,index=Number(slot.dataset.dropIndex);
  if(type==='deposit'||type==='withdraw'){const ok=await warehouseTransfer(type,name,1);hint(ok?'Предмет перемещён.':'Не удалось переместить предмет.');return;}
  if(['weapon','armor','detector'].includes(type)){const ok=await equipItem(name);hint(ok?'Предмет экипирован.': 'Не удалось экипировать предмет.');return;}
  await waitForSaveQueue();
  const endpoint=type==='artifact'?'/api/artifact-slots/equip':'/api/quickslots/set';
  const response=await fetch(SERVER_URL+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:window.Telegram?.WebApp?.initData,itemName:name,index})});
  const result=await response.json();if(!result.success){hint(result.error||'Не удалось переместить предмет.');return;}
  if(type==='artifact')applyEquipmentServerState(result.state);
  else{player.quickSlots=result.quickSlots;renderInventory();renderQuickSlots();}
  hint('Предмет помещён в слот.');
 }catch(e){hint('Ошибка соединения. Проверь инвентарь перед повторной попыткой.');}
 finally{busy=false;screen.removeAttribute('aria-busy');}
}
function init(){
 screen=document.getElementById('inventoryScreen');if(!screen)return;
 const help=document.createElement('p');help.id='inventoryDragHint';help.setAttribute('role','status');document.getElementById('inventoryGrid').before(help);hint();
 window.InventoryDrag={refresh,refreshWarehouse};
 const warehouse=document.getElementById('warehouseScreen');
 if(warehouse){const help=document.createElement('p');help.id='warehouseDragHint';help.textContent='Удерживай и перетаскивай между складом и рюкзаком — по 1 предмету. Касание — обычные действия.';help.setAttribute('role','status');document.getElementById('warehouseGrid').before(help);refreshWarehouse(Object.keys(player.warehouse||{}).filter(n=>player.warehouse[n]>0),Object.keys(player.inventory).filter(n=>player.inventory[n]>0));}
 const deposit=document.createElement('button');deposit.type='button';deposit.id='inventoryWarehouseDrop';deposit.dataset.dropKind='deposit';deposit.textContent='📦 На склад — перетащи сюда предмет';deposit.onclick=()=>{if(!raidActive&&!inventoryOpenedFromRaid)openScreen('warehouse');};document.getElementById('inventoryGrid').before(deposit);
 const items=Object.keys(player.inventory).filter(n=>player.inventory[n]>0&&n!=='Книга знаний');refresh(items);
 fetch(SERVER_URL+'/api/equipment/features').then(r=>r.ok?r.json():null).then(x=>{preciseArtifacts=x?.artifactSlotTarget===true;}).catch(()=>{});
 document.addEventListener('pointerdown',e=>{
  if(gesture||busy||e.button!==0||e.isPrimary===false)return;
  const source=e.target.closest('[data-drag-item]');if(!source)return;
  const owner=source.closest('#inventoryScreen,#warehouseScreen');if(!owner||!owner.classList.contains('active'))return;screen=owner;
  let scroller=source.parentElement;while(scroller!==document.body&&!(scroller.scrollHeight>scroller.clientHeight&&/auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
  if(scroller===document.body)scroller=document.scrollingElement;
  gesture={id:e.pointerId,source,from:source.dataset.dragFrom||'inventory',name:source.dataset.dragItem,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,lastY:e.clientY,scroller,touch:e.pointerType==='touch',active:false};
  if(gesture.touch)gesture.timer=setTimeout(begin,220);
 });
 document.addEventListener('pointermove',e=>{
  const g=gesture;if(!g||g.id!==e.pointerId)return;
  g.x=e.clientX;g.y=e.clientY;
  if(!g.active&&Math.hypot(g.x-g.startX,g.y-g.startY)>8){
   if(g.touch){clearTimeout(g.timer);g.scrolling=true;}else begin();
  }
  if(g.scrolling){g.scroller.scrollTop+=g.lastY-g.y;suppressUntil=Date.now()+700;}
  g.lastY=g.y;if(g.active)e.preventDefault();
 },{passive:false});
 document.addEventListener('pointerup',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;
  const g=gesture,target=g.active?targetAt(e.clientX,e.clientY):null;cleanup();
  if(g.active){suppressUntil=Date.now()+700;if(target)void drop(g.name,target,g.from);else hint('Перетаскивание отменено.');}
 });
 function cancel(){if(gesture){suppressUntil=Date.now()+700;cleanup();hint();}}
 document.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
 [screen,warehouse].filter(Boolean).forEach(el=>new MutationObserver(()=>{if(!screen.classList.contains('active'))cancel();}).observe(el,{attributes:true,attributeFilter:['class']}));
 document.addEventListener('click',e=>{if((e.target.closest('#inventoryScreen,#warehouseScreen'))&&(Date.now()<suppressUntil||busy)){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('dragstart',e=>{if(e.target.closest('[data-drag-item]'))e.preventDefault();});
 document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-drag-item]')||gesture){e.preventDefault();e.stopPropagation();}},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
