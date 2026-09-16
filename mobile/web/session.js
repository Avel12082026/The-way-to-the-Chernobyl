(() => {
'use strict';
const server='https://213-176-92-184.sslip.io';
const key='zone-mobile-session';
let saved,credentials;
try {credentials=JSON.parse(window.DeviceSession?.read()||'null');}catch(_){}
try {saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch(_){saved=null;}
if(saved?.expiresAt<=Date.now())saved=null;
const nativeFetch=window.fetch.bind(window);
async function api(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await nativeFetch(server+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(saved?{Authorization:'Bearer '+saved.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});
  const data=await response.json();
  if(!response.ok||data.success===false){const error=new Error(data.error||'Сервер временно недоступен.');error.status=response.status;throw error;}
  return data;
 }finally{clearTimeout(timer);}
}
function forget(){saved=null;credentials=null;window.DeviceSession?.clear();sessionStorage.removeItem(key);sessionStorage.removeItem('zone-mobile-purchase');}
window.fetch=async function(input,init={}){
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href);
 if(url.origin!==server || !url.pathname.startsWith('/api/'))return nativeFetch(input,init);
 const headers=new Headers(input instanceof Request?input.headers:undefined);
 new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
 if(saved)headers.set('Authorization','Bearer '+saved.token);
 const response=await nativeFetch(input,{...init,headers});
 if(response.status===401){saved=null;sessionStorage.removeItem(key);location.replace('index.html');}
 return response;
};
window.GameSession={
 get user(){return saved?.user;},
 exit(){window.DeviceSession?.exit();},
 async resume(){
  if(saved){location.replace('game.html');return true;}
  if(!credentials)return false;
  try {await this.authenticate('login',credentials.login,credentials.password);return true;}
  catch(error){if(error.status===401||error.status===403){forget();}throw error;}
 },
 async authenticate(mode,login,password){const data=await api('/api/mobile/'+mode,{login,password});saved=data;credentials={login,password};if(window.DeviceSession&&!window.DeviceSession.save(JSON.stringify(credentials))){throw new Error('Не удалось сохранить вход на устройстве. Повтори попытку.');}sessionStorage.setItem(key,JSON.stringify(data));location.replace('game.html');},
 async logout(){try{await api('/api/mobile/logout',{});}finally{forget();location.replace('index.html');}},
 ensure(){if(!saved){location.replace('index.html');return false;}return true;},
 async renderShop(){
  const el=document.getElementById('starsShopItems');el.textContent='Загрузка магазина…';
  try{
   const {items}=await api('/api/mobile/shop');el.replaceChildren();
   for(const p of items){
    const card=document.createElement('div');card.className='shop-item';
    const title=document.createElement('strong');title.textContent=p.title;
    const desc=document.createElement('p');desc.textContent=p.desc;
    const button=document.createElement('button');button.textContent=`Купить за ${p.price} жетонов сталкера`;
    button.onclick=async()=>{
     if(!confirm(`Купить «${p.title}» за ${p.price} жетонов сталкера?`))return;
     button.disabled=true;
     let pending;try{pending=JSON.parse(sessionStorage.getItem('zone-mobile-purchase')||'null');}catch(_){}
     if(pending&&pending.packageId!==p.id){showGameAlert('Сначала повторите предыдущую покупку, чтобы проверить её результат.');button.disabled=false;return;}
     pending=pending||{requestId:crypto.randomUUID(),packageId:p.id};
     sessionStorage.setItem('zone-mobile-purchase',JSON.stringify(pending));
     try{await api('/api/mobile/shop/buy',pending);sessionStorage.removeItem('zone-mobile-purchase');await reloadPrivatePlayerState();showGameAlert('Покупка выполнена.');}
     catch(e){if(e.status>=400&&e.status<500){sessionStorage.removeItem('zone-mobile-purchase');showGameAlert(e.message);}else showGameAlert(e.message+' Повторная попытка проверит эту же покупку без повторного списания.');}
     finally{button.disabled=false;}
    };
    card.append(title,desc,button);el.append(card);
   }
  }catch(e){el.textContent=e.message;}
 }
};
})();
