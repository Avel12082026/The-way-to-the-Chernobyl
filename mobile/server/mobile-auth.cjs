'use strict';
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SESSION_MS = 24 * 60 * 60 * 1000;
const loginName = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validLogin = value => /^[a-z0-9_]{3,32}$/.test(value);
const validPassword = value => typeof value === 'string' && value.length >= 12 && value.length <= 128;
const fail = (res,status,error) => res.status(status).json({success:false,error});
module.exports = function installMobile({app,db,checkTelegramAuth,createFreshPlayerDataServer,itemPackages}) {
  db.exec(`CREATE TABLE IF NOT EXISTS mobile_accounts (
    login TEXT PRIMARY KEY, player_id TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mobile_sessions (
    token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS mobile_sessions_player ON mobile_sessions(player_id);
    CREATE TABLE IF NOT EXISTS mobile_purchases (
    player_id TEXT NOT NULL, request_id TEXT NOT NULL, package_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY(player_id,request_id));`);
  app.get('/api/mobile/status',(_req,res)=>res.json({success:true,version:1}));
  const buckets = new Map();
  let activeHashes=0;
  function limit(req,res,next) {
    const now=Date.now();
    for (const [key,b] of buckets) if(b.until<=now) buckets.delete(key);
    const key=req.ip || req.socket?.remoteAddress || 'unknown';
    const b=buckets.get(key)||{until:now+60000,count:0};
    if(++b.count>12 || buckets.size>=10000 || activeHashes>=4) return fail(res,429,'Слишком много попыток. Повторите через минуту.');
    buckets.set(key,b);next();
  }
  async function derive(password,salt) {
    activeHashes++;
    try {return await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});}
    finally {activeHashes--;}
  }
  function resolve(req) {
    const auth=req.headers.authorization;
    if(typeof auth!=='string'||!/^Bearer [a-f0-9]{64}$/.test(auth)) return null;
    const row=db.prepare('SELECT player_id FROM mobile_sessions WHERE token_hash=? AND expires_at>?').get(hash(auth.slice(7)),Date.now());
    if(!row) return null;
    const player=db.prepare('SELECT username,data FROM players WHERE id=?').get(row.player_id);
    if(!player || JSON.parse(player.data).banned) return null;
    return {id:row.player_id,username:player.username};
  }
  function requireMobile(req,res,next) {
    const user=resolve(req);if(!user) return fail(res,401,'Войдите в профиль заново.');
    req.mobileUser=user;next();
  }
  function session(playerId) {
    const token=crypto.randomBytes(32).toString('hex'),expiresAt=Date.now()+SESSION_MS;
    db.prepare('DELETE FROM mobile_sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('INSERT INTO mobile_sessions VALUES(?,?,?)').run(hash(token),playerId,expiresAt);
    return {success:true,token,expiresAt,user:{id:playerId}};
  }
  const wrap = fn => (req,res,next) => Promise.resolve().then(()=>fn(req,res)).catch(next);
  app.post('/api/mobile/register',limit,wrap(async(req,res)=>{
    const login=loginName(req.body.login),password=req.body.password;
    if(!validLogin(login)||!validPassword(password)) return fail(res,400,'Логин: 3–32 латинские буквы, цифры или _. Пароль: 12–128 символов.');
    const salt=crypto.randomBytes(16).toString('hex');
    const digest=(await derive(password,salt)).toString('hex');
    const id='m'+crypto.randomBytes(12).toString('hex');
    try {
      db.transaction(()=>{
        db.prepare('INSERT INTO mobile_accounts VALUES(?,?,?,?,?)').run(login,id,salt,digest,Date.now());
        db.prepare('INSERT INTO players(id,username,data,last_seen,created_at,state_version) VALUES(?,?,?,?,?,0)').run(id,login,JSON.stringify(createFreshPlayerDataServer()),Date.now(),Date.now());
      })();
    } catch(e) {if(String(e.code).includes('CONSTRAINT') || /UNIQUE constraint/.test(e.message)) return fail(res,409,'Этот логин уже занят.');throw e;}
    res.json(session(id));
  }));
  app.post('/api/mobile/login',limit,wrap(async(req,res)=>{
    const login=loginName(req.body.login),password=req.body.password;
    if(!validLogin(login)||!validPassword(password)) return fail(res,401,'Неверный логин или пароль.');
    const account=db.prepare('SELECT * FROM mobile_accounts WHERE login=?').get(login);
    const digest=await derive(password,account?.salt || '00000000000000000000000000000000');
    if(!account || !crypto.timingSafeEqual(digest,Buffer.from(account.password_hash,'hex'))) return fail(res,401,'Неверный логин или пароль.');
    const row=db.prepare('SELECT data FROM players WHERE id=?').get(account.player_id);
    if(!row || JSON.parse(row.data).banned) return fail(res,403,'Профиль недоступен.');
    res.json(session(account.player_id));
  }));
  // Binding requires a signed, fresh Telegram session, never a user-supplied player ID.
  app.post('/api/mobile/link',limit,wrap(async(req,res)=>{
    const signed=req.body.initData;
    const params=new URLSearchParams(typeof signed==='string'?signed:'');
    const age=Date.now()/1000-Number(params.get('auth_date'));
    const user=checkTelegramAuth(signed);
    if(!user?.id || !Number.isFinite(age)||age< -30||age>600) return fail(res,401,'Откройте игру в Telegram заново для привязки профиля.');
    const row=db.prepare('SELECT data FROM players WHERE id=?').get(String(user.id));
    if(!row||JSON.parse(row.data).banned) return fail(res,403,'Профиль недоступен.');
    const login=loginName(req.body.login),password=req.body.password;
    if(!validLogin(login)||!validPassword(password)) return fail(res,400,'Логин: 3–32 латинские буквы, цифры или _. Пароль: 12–128 символов.');
    const salt=crypto.randomBytes(16).toString('hex');
    const digest=(await derive(password,salt)).toString('hex');
    try {db.prepare('INSERT INTO mobile_accounts VALUES(?,?,?,?,?)').run(login,String(user.id),salt,digest,Date.now());}
    catch(e) {if(String(e.code).includes('CONSTRAINT') || /UNIQUE constraint/.test(e.message))return fail(res,409,'Логин или профиль уже привязан.');throw e;}
    res.json({success:true});
  }));
  app.post('/api/mobile/logout',requireMobile,(req,res)=>{
    db.prepare('DELETE FROM mobile_sessions WHERE token_hash=?').run(hash(req.headers.authorization.slice(7)));
    res.json({success:true});
  });
  // Keep the existing token/byte exchange. Do not create token-to-token packages.
  // Item prices are explicit server values, independent of Telegram Stars.
  const prices={knowledge_book:20,nickname_credit:20,detector_t9:100,armor_81:200,armor_82:200,armor_83:200,armor_84:200};
  const catalog=itemPackages.filter(p=>Object.hasOwn(prices,p.id)).map(p=>({id:p.id,title:p.title,desc:p.desc,itemName:p.itemName,qty:p.qty,price:prices[p.id]}));
  app.get('/api/mobile/shop',requireMobile,(req,res)=>res.json({success:true,items:catalog}));
  const purchase=db.transaction((playerId,requestId,packageId)=>{
    const old=db.prepare('SELECT package_id FROM mobile_purchases WHERE player_id=? AND request_id=?').get(playerId,requestId);
    if(old){if(old.package_id!==packageId)throw new Error('Номер покупки уже использован.');return;}
    const pkg=catalog.find(p=>p.id===packageId);if(!pkg)throw new Error('Товар не найден.');
    const row=db.prepare('SELECT data FROM players WHERE id=?').get(playerId);
    const data=JSON.parse(row.data),balance=Number(data.breedCredits)||0;
    if(!Number.isSafeInteger(balance)||balance<pkg.price)throw new Error('Недостаточно жетонов сталкера.');
    data.breedCredits=balance-pkg.price;
    if(pkg.id==='nickname_credit')data.nicknameChangeCredits=(Number(data.nicknameChangeCredits)||0)+pkg.qty;
    else {data.inventory=data.inventory||{};data.inventory[pkg.itemName]=(Number(data.inventory[pkg.itemName])||0)+pkg.qty;}
    db.prepare('UPDATE players SET data=?,last_seen=? WHERE id=?').run(JSON.stringify(data),Date.now(),playerId);
    db.prepare('INSERT INTO mobile_purchases VALUES(?,?,?,?)').run(playerId,requestId,packageId,Date.now());
  });
  app.post('/api/mobile/shop/buy',requireMobile,(req,res)=>{
    if(!/^[a-f0-9-]{36}$/.test(req.body.requestId||''))return fail(res,400,'Некорректный номер покупки.');
    try {purchase(req.mobileUser.id,req.body.requestId,req.body.packageId);res.json({success:true});}
    catch(e){fail(res,400,e.message);}
  });
  return {resolve};
};
