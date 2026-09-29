'use strict';
// Full production client with an ordinary offline player and fully mocked API.
// No live player, inventory, travel, administrator menus or network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,process.cwd()].filter(Boolean)}));
const root=path.resolve(__dirname,'..');
const telegram="window.Telegram={WebApp:{initData:'offline-leonov-only',initDataUnsafe:{user:{id:101}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};";
function fixtureHtml(){
 let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 html=html.replace(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g,(tag,src)=>{
  const file=path.join(root,src.split('?')[0]);let code=src.includes('telegram-web-app.js')?telegram:fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
  if(tag.includes('defer'))code="document.addEventListener('DOMContentLoaded',()=>{"+code+"},{once:true});";
  return '<script>'+code+'</script>';
 });
 return html.replace(/<link\b[^>]*href="([^"]+)"[^>]*>/g,(_,src)=>{const f=path.join(root,src.split('?')[0]);return fs.existsSync(f)?'<style>'+fs.readFileSync(f,'utf8')+'</style>':'';});
}
async function main(){
 const calls=[],errors=[],external=[];
 let privateReads=0;
 const state={nickname:'Обычный тестовый сталкер',health:89,maxHealth:150,hunger:80,thirst:80,coins:6891,breedCredits:7,level:100,exp:123,radiation:0,inventory:{},warehouse:{},isAdmin:false,worldPosition:{zoneLocation:6,place:'yantar-bunker',origin:'yantar-bunker'}};
 const html=fixtureHtml(),server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  await context.route('**/*',async route=>{
   const request=route.request();
   if(request.isNavigationRequest()&&request.url()===url)return route.continue();
   external.push({url:request.url(),method:request.method()});
   if(request.resourceType()==='image')return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="941" height="1672"/>'});
   return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('__leonovFixture',async (api,body,method)=>{
   calls.push({api,body,method});
   if(api.endsWith('/player/private')){privateReads++;return state;}
   if(api.endsWith('/player/position')){
    const {zoneLocation,place,origin}=body;state.worldPosition={zoneLocation,place,origin};return {success:true,worldPosition:state.worldPosition};
   }
   if(api.endsWith('/artifacts/breed')){
    for(const name of [body.parent1,body.parent2]){assert(state.inventory[name]>0);state.inventory[name]--;}
    const artifact={name:'Локальная проверка селекции',tier:1,gen:1,stats:{health:1}};
    state.inventory[artifact.name]=1;state.breedCredits--;state.craftedArtifacts={[artifact.name]:artifact};
    return {success:true,inventory:state.inventory,breedCredits:state.breedCredits,artifact};
   }
   if(api.endsWith('/equipment/features'))return {artifactSlotTarget:true};
   if(api.includes('/faction'))return {success:true,faction:null};
   return [];
  });
  await page.addInitScript(telegram+`window.fetch=async(input,init={})=>{
   const p=new URL(typeof input==='string'?input:input.url,location.href).pathname;
   const value=p.includes('/api/')?await window.__leonovFixture(p,init.body?JSON.parse(init.body):{},init.method||'GET'):{};
   return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  };`);
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.BunkerMenu&&window.GamePosition?.current?.zoneLocation===6&&document.querySelector('#yantarCampScreen.active'));
  assert.equal(await page.evaluate(()=>String(Telegram.WebApp.initDataUnsafe.user.id)===ADMIN_ID),false);
  const names=await page.evaluate(()=>artifacts.filter(a=>!a.isNamedArtifact&&!a.gen).slice(0,2).map(a=>a.name));assert.equal(names.length,2);
  Object.assign(state,await page.evaluate(()=>JSON.parse(JSON.stringify(player))));
  for(const name of names)state.inventory[name]=2;
  await page.evaluate(async()=>{await reloadPrivatePlayerState();});
  async function yantarPosition(label){
   const current=await page.evaluate(()=>GamePosition.current);assert.equal(current.zoneLocation,6,label);assert.equal(current.origin,'yantar-bunker',label);
  }
  async function enterSelection(){
   await page.locator('[data-yantar-action="leonov"]').click();
   await page.locator('#leonovHubScreen.active').waitFor();await yantarPosition('Leonov keeps Yantar');
   await page.locator('[data-leonov-action="selection"]').click();
   await page.locator('#leonovSelectionPanel').waitFor({state:'visible'});await yantarPosition('Selection keeps Yantar');
  }
  async function exitAndBack(){
   await page.locator('#scientistsScreen .back-btn:visible').click();
   await page.locator('#leonovHubScreen.active').waitFor();await yantarPosition('Selection exit returns to Yantar Leonov');
   await page.waitForTimeout(180);
   await page.locator('[data-leonov-action="back"]').click();
   await page.locator('#yantarCampScreen.active').waitFor();await yantarPosition('Leonov back returns to Yantar bunker');
   await page.waitForTimeout(180);
  }
  await enterSelection();await exitAndBack();
  await enterSelection();
  await page.evaluate(([a,b])=>{breedSlot1=a;breedSlot2=b;renderScientists();},names);
  const beforeReads=privateReads;
  await page.locator('#leonovBreedButton').click();
  await page.waitForFunction(()=>player.inventory['Локальная проверка селекции']===1&&!document.querySelector('#leonovSelectionPanel[aria-busy="true"]'));
  assert(privateReads>beforeReads,'Successful breeding reloads the private profile');
  assert.equal(calls.filter(c=>c.api.endsWith('/artifacts/breed')).length,1);
  await yantarPosition('Successful selection/profile reload keeps Yantar');await exitAndBack();
  assert.equal(state.worldPosition.place,'yantar-bunker');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#yantarCampScreen.active').waitFor();await yantarPosition('Saved Yantar position survives a full reload');
  const positions=calls.filter(c=>c.api.endsWith('/player/position'));
  assert(positions.length>0,'The fixture exercised real position persistence');
  assert(positions.every(c=>c.body.zoneLocation===6&&c.body.origin==='yantar-bunker'&&['leonov','yantar-bunker'].includes(c.body.place)),'No transient Cordon position write is allowed: '+JSON.stringify(positions));
  assert(!external.some(r=>r.method!=='GET'),'Every browser network write must be intercepted');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,ordinaryPlayer:true,liveWrites:0,mockBreedRequests:1,profileReload:true,selectionExitToLeonov:true,leonovBackToYantar:true,reloadRestoresYantar:true,positionWrites:positions.map(p=>({zoneLocation:p.body.zoneLocation,place:p.body.place,origin:p.body.origin})),pageErrors:errors},null,2));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
