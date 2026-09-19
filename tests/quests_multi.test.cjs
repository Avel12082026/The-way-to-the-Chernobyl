'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const install=require('../server_patches/quest-balance.cjs');
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE players(id TEXT PRIMARY KEY,data TEXT,last_seen INTEGER); CREATE TABLE raid_sessions(player_id TEXT); CREATE TABLE pve_battles(player_id TEXT);');
sql.prepare('INSERT INTO players VALUES(?,?,0)').run('1',JSON.stringify({level:100,coins:100,inventory:{},quests:{}}));
const db={exec:s=>sql.exec(s),prepare:s=>sql.prepare(s),transaction:fn=>(...args)=>{sql.exec('BEGIN');try{const r=fn(...args);sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const routes={},app={post:(url,...hs)=>routes[url]=hs.at(-1),get:(url,fn)=>routes[url]=fn};
const weapons=[1,2,3].map(n=>({name:'Ствол '+n,tier:n,price:200*n,unlockLevel:n}));
install({app,db,requireAuth(){},rateLimit:()=>()=>{},SHOP_WEAPONS:weapons,SHOP_ARMOR:[],SHOP_ARTIFACTS:[],SHOP_MUTANT_LOOT:[],PVE_MUTANTS:[],RAID_ANOMALIES:[],resolveSellPriceServer:n=>({price:100,category:'weapon'}),parseGearNameServer:n=>({baseName:n,level:0})});
const read=()=>JSON.parse(sql.prepare('SELECT data FROM players WHERE id=?').get('1').data);
const save=d=>sql.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify(d),'1');
function call(path,body={}){const res={code:200,status(n){this.code=n;return this;},json(x){this.body=x;return x;}};routes['/api/quests'+path]({telegramUser:{id:'1'},body},res);return res;}
assert.equal(call('/version').body.multiActive,true);
const offers=call('/offers',{vendor:'diesel'}).body.offers;assert.equal(offers.length,3);
const d=read();for(const q of offers)d.inventory[q.itemName]=q.qty;save(d); // owned BEFORE accepting
for(const q of offers)assert.equal(call('/accept',{vendor:'diesel',questId:q.id}).code,200);
const ids=offers.map(q=>q.id);
assert.equal(call('/activate',{questId:ids[0]}).code,200);
let r=call('/activate',{questId:ids[1]});assert.deepEqual(r.body.activeIds,ids.slice(0,2));
r=call('/activate',{questIds:ids});assert.deepEqual(r.body.activeIds,ids);
assert.deepEqual(call('/activate',{questIds:ids}).body.activeIds,ids,'idempotent batch activation');
assert.deepEqual(call('/state').body.activeIds,ids,'persist across reload');
assert.equal(call('/activate',{questIds:[ids[0],'unknown']}).code,400);assert.deepEqual(call('/state').body.activeIds,ids);
assert.deepEqual(call('/deactivate',{questId:ids[1]}).body.activeIds,[ids[0],ids[2]]);
assert.deepEqual(call('/activate',{questId:ids[1]}).body.activeIds,[ids[0],ids[2],ids[1]]);
// Legacy activeId is migrated once; an explicitly empty array must not resurrect it.
const legacy=read();delete legacy.quests.activeIds;legacy.quests.activeId=ids[0];save(legacy);
assert.deepEqual(call('/state').body.activeIds,[ids[0]]);
legacy.quests.activeIds=[];save(legacy);assert.deepEqual(call('/state').body.activeIds,[]);
call('/activate',{questIds:ids});
sql.prepare('INSERT INTO raid_sessions VALUES(?)').run('1');
const before=JSON.stringify(read());assert.equal(call('/turn-in',{questId:ids[0],vendor:'diesel'}).code,400);assert.equal(JSON.stringify(read()),before);sql.exec('DELETE FROM raid_sessions');
r=call('/turn-in',{questId:ids[0],vendor:'diesel',reward:999999,qty:0});assert.equal(r.code,200);
assert.equal(read().coins,100+offers[0].reward);assert.deepEqual(r.body.activeIds,ids.slice(1));
const paid=read().coins;assert.equal(call('/turn-in',{questId:ids[0],vendor:'diesel'}).code,400);assert.equal(read().coins,paid);
assert.equal(call('/abandon',{questId:ids[1],vendor:'diesel'}).code,200);assert.deepEqual(call('/state').body.activeIds,[ids[2]]);
console.log('PASS: SQLite multi-quest migration, single/batch activation, deactivation, persistence, immediate hand-in, base-only guard, no duplicate payout');
