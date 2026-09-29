const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('    async function battleAction('),html.indexOf('    function endBattle('));
function setup(options={}){
 const requests=[],reactions=[],presentations=[];
 const e={currentEnemy:{name:'Мутант',battleToken:'one',hp:100},battleTurn:0,raidLogs:[],player:{health:100},raidActive:true,raidSessionToken:'raid',isFriendlyEncounterActive:false,
 SERVER_URL:'test',PVE_BATTLE_MEDKIT_LIMIT_CLIENT:3,window:{CombatScene:{react(...a){reactions.push(a);if(options.deferPresentation)return new Promise((resolve,reject)=>presentations.push({resolve,reject}));}}},console,
 renderBattleButtons(){},updateRaidLog(){},updateUI(){},showGameAlert(){},openScreen(){},
 clearBattleUiAndRestoreNav(){},applyPveServerState(s){Object.assign(e.player,s);},
 applyEquipmentServerState(s){Object.assign(e.player,s);},endBattle(){e.currentEnemy=null;e.battleTurn=0;},
 async claimPveVictory(enemy){e.claimCount=(e.claimCount||0)+1;e.claimed=enemy;e.currentEnemy=null;e.battleTurn=0;},
 fetch:(url,opts)=>new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(opts.body),reply:x=>resolve({json:async()=>x}),reject}))};
 vm.createContext(e);vm.runInContext(code,e);return {e,requests,reactions,presentations};
}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
(async()=>{
 for(const action of ['attack','medkit','escape']){
  const {e,requests,reactions}=setup(),pending=e.battleAction(action);
  assert.equal(e.battleTurn,1);await e.battleAction(action);assert.equal(requests.length,1,'Double tap sent another turn');
  requests[0].reply({success:true,enemyHp:75,enemyTurn:{damage:10},state:{health:90}});await pending;
  assert.equal(e.player.health,90);assert.equal(e.battleTurn,0);assert.equal(reactions.length,1);assert.equal(reactions[0][2],action);
 }
 for(const result of [{success:false,error:'rejected'},{success:true,victoryReady:true,enemyHp:0},{success:true,died:true,state:{health:0}},{success:true,escaped:true}]){
  const {e,requests}=setup(),pending=e.battleAction(result.escaped?'escape':'attack');requests[0].reply(result);await pending;
  assert.equal(e.battleTurn,0);if(result.victoryReady)assert.equal(e.claimed.hp,0);if(result.died||result.escaped)assert.equal(e.currentEnemy,null);
 }
 {
  const {e,requests}=setup(),pending=e.battleAction('attack');
  requests[0].reject(Error('offline'));await pending;assert.equal(e.battleTurn,0);
 }
 {
  const {e,requests}=setup(),pending=e.battleAction('attack');e.currentEnemy={name:'Другой',battleToken:'two',hp:200};e.battleTurn=1;
  requests[0].reply({success:true,enemyHp:0,state:{health:1},died:true});await pending;
  assert.equal(e.currentEnemy.hp,200);assert.equal(e.player.health,100);assert.equal(e.battleTurn,1);
 }
 {
  const {e,requests,reactions}=setup(),pending=e.triggerEnemyTurn();await e.triggerEnemyTurn();assert.equal(requests.length,1);
  requests[0].reply({success:true,enemyTurn:{damage:0}});await pending;assert.equal(reactions[0][2],'wait');assert.equal(e.battleTurn,0);
 }
 {
  const {e,requests}=setup(),pending=e.requestCombatConsumable('Аптечка');assert.equal(e.battleTurn,1);
  assert.equal(await e.requestCombatConsumable('Аптечка'),null);await e.battleAction('attack');assert.equal(requests.length,1);
  requests[0].reply({success:true,enemyTurn:{damage:5}});const outcome=await pending;assert.equal(outcome.battleToken,'one');assert.equal(e.battleTurn,0);
 }
 {
  const {e,requests}=setup(),pending=e.requestCombatConsumable('Аптечка');e.currentEnemy=null;requests[0].reply({success:true,died:true});assert.equal(await pending,null);
 }
 {
  const {e,requests,presentations}=setup({deferPresentation:true}),enemy=e.currentEnemy,pending=e.battleAction('attack');
  requests[0].reply({success:true,playerDamage:150,enemyHp:0,victoryReady:true,state:{health:80}});await flush();
  assert.equal(presentations.length,1);assert.equal(e.currentEnemy,enemy);assert.equal(enemy.hp,100,'Enemy must stay alive during the audiovisual burst');
  assert.equal(e.player.health,100);assert.equal(e.claimed,undefined);assert.equal(e.raidLogs.length,0);assert.equal(e.battleTurn,1);
  await e.battleAction('attack');assert.equal(requests.length,1,'A burst is one server attack, even on repeated taps');
  presentations[0].resolve({cancelled:false});await pending;
  assert.equal(enemy.hp,0);assert.equal(e.player.health,80);assert.equal(e.claimCount,1);assert.equal(e.currentEnemy,null);assert.equal(requests.length,1);
 }
 for(const action of ['attack','medkit','escape','wait']){
  const {e,requests,presentations}=setup({deferPresentation:true});
  const pending=action==='wait'?e.triggerEnemyTurn():e.battleAction(action);
  requests[0].reply({success:true,playerDamage:2,enemyHp:98,enemyTurn:{damage:100},died:true,state:{health:0}});await flush();
  assert.equal(presentations.length,1);assert(e.currentEnemy,'Player death must wait for the NPC burst');assert.equal(e.player.health,100);assert.equal(e.battleTurn,1);
  presentations[0].resolve({cancelled:false});await pending;assert.equal(e.currentEnemy,null);assert.equal(e.player.health,0);
 }
 {
  const {e,requests,presentations}=setup({deferPresentation:true}),pending=e.requestCombatConsumable('Аптечка');
  requests[0].reply({success:true,enemyTurn:{damage:5}});await flush();
  assert.equal(e.battleTurn,1);assert.equal(await e.requestCombatConsumable('Аптечка'),null);await e.battleAction('attack');assert.equal(requests.length,1);
  presentations[0].resolve({cancelled:false});assert.equal((await pending).battleToken,'one');assert.equal(e.battleTurn,0);
 }
 {
  const {e,requests,presentations}=setup({deferPresentation:true}),pending=e.battleAction('attack');
  requests[0].reply({success:true,playerDamage:100,enemyHp:0,victoryReady:true,state:{health:1}});await flush();
  e.currentEnemy={name:'Другой',battleToken:'two',hp:200};presentations[0].resolve({cancelled:true});await pending;
  assert.equal(e.currentEnemy.hp,200);assert.equal(e.player.health,100);assert.equal(e.claimed,undefined);assert.equal(e.battleTurn,1);
 }
 for(const cancelled of [true,false]){
  const {e,requests,presentations}=setup({deferPresentation:true}),pending=e.battleAction('attack');
  requests[0].reply({success:true,playerDamage:5,enemyHp:95,state:{health:90}});await flush();
  if(cancelled)presentations[0].resolve({cancelled:true});else presentations[0].reject(Error('Renderer unavailable'));
  await pending;assert.equal(e.currentEnemy.hp,95);assert.equal(e.player.health,90);assert.equal(e.battleTurn,0);assert.equal(requests.length,1,'Presentation failure cannot repeat an accepted server turn');
 }
 for(const action of ['attack','escape','wait','consumable']){
  const {e,requests,presentations}=setup({deferPresentation:true});
  const pending=action==='wait'?e.triggerEnemyTurn():action==='consumable'?e.requestCombatConsumable('Аптечка'):e.battleAction(action);
  requests[0].reply({success:true,playerDamage:100,enemyHp:0,victoryReady:true,state:{health:1}});await flush();
  const nextEnemy={name:'Новый бой',battleToken:'two',hp:200};
  presentations[0].resolve({cancelled:false});
  queueMicrotask(()=>queueMicrotask(()=>{e.currentEnemy=nextEnemy;e.battleTurn=0;}));
  await pending;
  assert.equal(e.currentEnemy,nextEnemy,'A battle switch between promise continuations cannot be overwritten');assert.equal(nextEnemy.hp,200);
  assert.equal(e.player.health,100);assert.equal(e.claimed,undefined);assert.equal(e.battleTurn,0);
 }
 // Compile every inline script, including the two updated consumable callers.
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 console.log('Combat turns: one-request bursts, deferred HP/death/rewards, locked controls, cancellation, failures and stale replies passed');
})().catch(e=>{console.error(e);process.exitCode=1});
