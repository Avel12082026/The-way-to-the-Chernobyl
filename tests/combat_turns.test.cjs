const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('    async function battleAction('),html.indexOf('    function endBattle('));
function setup(){
 const requests=[],reactions=[];
 const e={currentEnemy:{name:'Мутант',battleToken:'one',hp:100},battleTurn:0,raidLogs:[],player:{health:100},raidActive:true,raidSessionToken:'raid',isFriendlyEncounterActive:false,
 SERVER_URL:'test',PVE_BATTLE_MEDKIT_LIMIT_CLIENT:3,window:{CombatScene:{react:(...a)=>reactions.push(a)}},console,
 renderBattleButtons(){},updateRaidLog(){},updateUI(){},showGameAlert(){},openScreen(){},
 clearBattleUiAndRestoreNav(){},applyPveServerState(s){Object.assign(e.player,s);},
 applyEquipmentServerState(s){Object.assign(e.player,s);},endBattle(){e.currentEnemy=null;e.battleTurn=0;},
 async claimPveVictory(enemy){e.claimed=enemy;e.currentEnemy=null;e.battleTurn=0;},
 fetch:(url,opts)=>new Promise((resolve,reject)=>requests.push({url,body:JSON.parse(opts.body),reply:x=>resolve({json:async()=>x}),reject}))};
 vm.createContext(e);vm.runInContext(code,e);return {e,requests,reactions};
}
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
 // Compile every inline script, including the two updated consumable callers.
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 console.log('Combat turns: double taps, consumables, misses, escape, victory, death, rejection, network failure and stale replies passed');
})().catch(e=>{console.error(e);process.exitCode=1});
