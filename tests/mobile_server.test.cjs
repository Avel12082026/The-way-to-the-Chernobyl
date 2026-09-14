'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const install=require('../mobile/server/mobile-auth.cjs');
function setup(){
 const db=new DatabaseSync(':memory:');db.transaction=fn=>(...args)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn(...args);db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
 db.exec('CREATE TABLE players(id TEXT PRIMARY KEY,username TEXT,data TEXT,last_seen INTEGER,created_at INTEGER,state_version INTEGER);');
 const routes=new Map(),app={post:(p,...f)=>routes.set('POST '+p,f),get:(p,...f)=>routes.set('GET '+p,f)};
 const tokenAuth=install({app,db,checkTelegramAuth:s=>s?.startsWith('signed=1&')?{id:'original'}:null,createFreshPlayerDataServer:()=>({breedCredits:0,inventory:{},coins:5000}),itemPackages:[{id:'knowledge_book',title:'Book',itemName:'Книга знаний',qty:1},{id:'breed_credit',qty:1}]});
 let ipCounter=0;
 async function request(path,body={},token,method='POST',ip){
  const req={body,headers:token?{authorization:'Bearer '+token}:{},ip:ip||String(++ipCounter)},res={code:200,status(c){this.code=c;return this;},json(value){this.body=value;return this;}};
  const list=routes.get(method+' '+path);let i=0;await new Promise((resolve,reject)=>{const done=res.json.bind(res);res.json=x=>{done(x);resolve();return res;};const next=e=>{if(e)return reject(e);const f=list[i++];if(!f)return resolve();try{Promise.resolve(f(req,res,next)).catch(reject);}catch(e){reject(e);}};next();});return res;
 }
 return {db,request,tokenAuth};
}
test('registration, password verification, session expiry and logout',async()=>{
 const {db,request,tokenAuth}=setup();const r=await request('/api/mobile/register',{login:'Stalker_1',password:'long-secure-password'});assert.equal(r.code,200);
 const account=db.prepare('SELECT * FROM mobile_accounts').get();assert.equal(account.login,'stalker_1');assert.notEqual(account.password_hash,'long-secure-password');
 assert.equal((await request('/api/mobile/login',{login:'STALKER_1',password:'wrong-password'})).code,401);
 const signed=await request('/api/mobile/login',{login:'stalker_1',password:'long-secure-password'});assert.equal(signed.code,200);
 assert.equal(tokenAuth.resolve({headers:{authorization:'Bearer '+signed.body.token}}).id,r.body.user.id);
 assert.equal((await request('/api/mobile/register',{login:'stalker_1',password:'another-good-password'})).code,409);
 assert.equal((await request('/api/mobile/logout',{},signed.body.token)).code,200);
 assert.equal(tokenAuth.resolve({headers:{authorization:'Bearer '+signed.body.token}}),null);
 db.prepare('UPDATE mobile_sessions SET expires_at=0').run();assert.equal(tokenAuth.resolve({headers:{authorization:'Bearer '+r.body.token}}),null);db.close();
});
test('binding cannot claim an arbitrary profile and preserves existing progress',async()=>{
 const {db,request}=setup();db.prepare('INSERT INTO players VALUES(?,?,?,?,?,?)').run('original','Veteran',JSON.stringify({coins:42,breedCredits:17}),0,0,0);
 const data={login:'veteran',password:'a-long-enough-password',playerId:'original'};
 assert.equal((await request('/api/mobile/link',data)).code,401);
 const before=db.prepare('SELECT data FROM players').get().data;
 assert.equal((await request('/api/mobile/link',{...data,initData:'signed=1&auth_date='+Math.floor(Date.now()/1000)})).code,200);
 assert.equal(db.prepare('SELECT data FROM players').get().data,before);
 assert.equal((await request('/api/mobile/login',data)).body.user.id,'original');db.close();
});
test('token purchases are atomic, reject forged prices and deduplicate retries',async()=>{
 const {db,request}=setup();const {body:s}=await request('/api/mobile/register',{login:'buyer',password:'a-long-enough-password'});
 db.prepare('UPDATE players SET data=? WHERE id=?').run(JSON.stringify({breedCredits:25,inventory:{}}),s.user.id);
 const body={packageId:'knowledge_book',requestId:require('node:crypto').randomUUID(),price:0};
 assert.equal((await request('/api/mobile/shop/buy',body,s.token)).code,200);
 assert.equal((await request('/api/mobile/shop/buy',body,s.token)).code,200);
 const data=JSON.parse(db.prepare('SELECT data FROM players').get().data);assert.equal(data.breedCredits,5);assert.equal(data.inventory['Книга знаний'],1);
 assert.equal((await request('/api/mobile/shop/buy',{...body,requestId:require('node:crypto').randomUUID()},s.token)).code,400);
 assert.equal((await request('/api/mobile/shop/buy',{...body,packageId:'breed_credit'},s.token)).code,400);
 assert.equal((await request('/api/mobile/shop',{},'0'.repeat(64),'GET')).code,401);db.close();
});
test('rate limit and banned accounts cannot authenticate',async()=>{
 const {db,request}=setup();const body={login:'limited',password:'a-long-enough-password'};await request('/api/mobile/register',body);
 db.prepare('UPDATE players SET data=?').run('{"banned":true}');assert.equal((await request('/api/mobile/login',body)).code,403);
 for(let i=0;i<12;i++)await request('/api/mobile/login',{login:'bad'},undefined,'POST','same-ip');
 assert.equal((await request('/api/mobile/login',body,undefined,'POST','same-ip')).code,429);db.close();
});
test('actual uploaded server middleware accepts only the session owner', {skip:!process.env.MOBILE_SERVER_SOURCE}, async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const {db,request,tokenAuth}=setup();
 const source=fs.readFileSync(process.env.MOBILE_SERVER_SOURCE,'utf8');
 const start=source.indexOf('function requireAuth(req, res, next) {'),end=source.indexOf('// ===== ЗАЩИТА ОТ СПАМА',start);
 assert.ok(start>=0&&end>start);
 const middleware=source.slice(start,end).replace('const user = checkTelegramAuth(req.body.initData);','const user = req.headers.authorization ? mobileAuth.resolve(req) : checkTelegramAuth(req.body.initData);');
 const context={db,mobileAuth:tokenAuth,checkTelegramAuth:()=>({id:'other-telegram-player'}),safeParsePlayerData:JSON.parse,console};
 vm.createContext(context);vm.runInContext(middleware,context);
 const result=await request('/api/mobile/register',{login:'middleware',password:'a-long-enough-password'});
 const req={headers:{authorization:'Bearer '+result.body.token},body:{initData:'other-account',playerId:'other-telegram-player'}};
 let next=0;const res={status(code){this.code=code;return this;},json(body){this.body=body;}};
 context.requireAuth(req,res,()=>next++);assert.equal(next,1);assert.equal(req.telegramUser.id,result.body.user.id);
 req.headers.authorization='Bearer '+'0'.repeat(64);context.requireAuth(req,res,()=>next++);assert.equal(next,1);assert.equal(res.code,401);
 db.close();
});
