const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{
const root=path.resolve(__dirname,'..'),browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1536,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('http://pair.test/**',async route=>{
const pathname=new URL(route.request().url()).pathname;
if(pathname==='/')return route.fulfill({contentType:'text/html',body:`<body style="margin:0"><div id="combatScene"></div><script>
window.testNow=0;performance.now=()=>window.testNow;window.requestAnimationFrame=fn=>(window.testTick=fn,1);window.cancelAnimationFrame=()=>{};
window.COMBAT_ASSETS={pistols:[],armorIds:[91]};window.CombatAssets={getVisuals:()=>({ready:true,species:'zombie',background:'images/combat/backgrounds/zombie/1.png',mutant:'images/combat/mutants/zombie.png'})};
</script><script src="images/combat/layout.js"></script><script src="images/combat/effects.js"></script><script src="images/combat/scene.js"></script>`});
const file=path.join(root,pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Missing'});
const ext=path.extname(file);return route.fulfill({body:fs.readFileSync(file),contentType:ext==='.js'?'application/javascript':ext==='.webp'?'image/webp':ext==='.png'?'image/png':'text/plain'});
});
await page.goto('http://pair.test/');
const ok=await page.evaluate(()=>CombatScene.show({weaponId:9,armor:91,enemy:{battleToken:'qa',name:'Зомби',hp:100}}));if(!ok)throw Error('show failed');
const out=path.join(root,'asset_sources/forward_grips/9-91/browser-review');fs.mkdirSync(out,{recursive:true});
await page.locator('canvas').screenshot({path:path.join(out,'ready.png')});
await page.evaluate(()=>{CombatScene.react('qa',{success:true,enemyHp:90},'attack');window.testNow=40;window.testTick(40);});
await page.locator('canvas').screenshot({path:path.join(out,'shot40.png')});
await page.evaluate(()=>{window.testNow=240;window.testTick(240);});
await page.locator('canvas').screenshot({path:path.join(out,'return240.png')});
if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({show:ok,pageErrors:errors,rendererLoaded:await page.evaluate(()=>!!CombatPairedForeground)}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
