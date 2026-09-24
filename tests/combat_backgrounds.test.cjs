const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createSelector,entries}=require('../images/combat/backgrounds.js');

const pools={
 1:['field','flesh-1','flesh-2','flesh-3'],
 100:['chernobyl-dog-1','chernobyl-dog-2','chernobyl-dog-3'],
 200:['boar-1','boar-2','boar-3'],
 300:['hinge-1','hinge-2'],
 500:['reactor','hinge-1','hinge-2']
};

test('background IDs and asset paths are unique, with scene placement metadata',()=>{
 assert.equal(entries.length,13);
 assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
 assert.equal(new Set(entries.map(e=>e.image)).size,entries.length);
 for(const entry of entries){
  assert.match(entry.image,/^images\/combat\/backgrounds\/[a-z0-9-]+\/[a-z0-9-]+\.png$/);
  assert.equal(entry.groundY,940);
  assert.equal(entry.shadowOpacity,0.3);
 }
});

test('every tier boundary chooses from the correct scene pool',()=>{
 for(const [level,pool] of [[1,1],[99,1],[99.9,1],[100,100],[199,100],[200,200],[299,200],[300,300],[499,300],[500,500],[99999,500],['200',200]]){
  const selector=createSelector();
  for(let i=0;i<12;i++){
   const result=selector.resolve({playerLevel:level,battleToken:'boundary-'+i});
   assert.ok(pools[pool].includes(result.id),`level ${level}: ${result.id}`);
   assert.ok(result.minLevel<=Number(level));
  }
 }
});

test('invalid or absent levels use the starting area',()=>{
 for(const level of [undefined,null,false,{},[],NaN,Infinity,-Infinity,-10,0,0.5,'','bad']){
  const selector=createSelector();
  assert.ok(pools[1].includes(selector.resolve({playerLevel:level,battleToken:'invalid'}).id));
 }
 assert.ok(pools[1].includes(createSelector().resolve().id));
});

test('one battle retains its scenery through level, equipment, and health updates',()=>{
 const selector=createSelector();
 const first=selector.resolve({playerLevel:1,battleToken:'same-battle'});
 selector.resolve({playerLevel:1,battleToken:'other-battle'});
 assert.deepEqual(selector.resolve({playerLevel:600,battleToken:'same-battle',armorId:40,hp:5}),first);
 first.id='changed-by-caller';
 assert.notEqual(selector.resolve({playerLevel:600,battleToken:'same-battle'}).id,first.id);
});

test('consecutive new encounters do not repeat within each tier',()=>{
 const selector=createSelector();
 for(const level of Object.keys(pools)){
  let previous;
  for(let i=0;i<40;i++){
   const result=selector.resolve({playerLevel:level,battleToken:level+'-'+i});
   assert.notEqual(result.id,previous,`level ${level}, encounter ${i}`);
   previous=result.id;
  }
 }
});

test('missing battle tokens are deterministic and do not affect encounter selection',()=>{
 const actual=createSelector(),control=createSelector();
 actual.resolve({playerLevel:1,battleToken:'before'});
 control.resolve({playerLevel:1,battleToken:'before'});
 for(const token of [undefined,null,'','   ',{},NaN]){
  const first=actual.resolve({playerLevel:1,battleToken:token});
  assert.deepEqual(actual.resolve({playerLevel:1,battleToken:token}),first);
 }
 assert.deepEqual(actual.resolve({playerLevel:1,battleToken:'after'}),control.resolve({playerLevel:1,battleToken:'after'}));
});

test('numeric token zero is a real stable battle token',()=>{
 const selector=createSelector();
 const first=selector.resolve({playerLevel:1,battleToken:0});
 assert.deepEqual(selector.resolve({playerLevel:600,battleToken:0}),first);
});

test('bounded cache expires old encounters while retaining recent ones',()=>{
 const selector=createSelector({maxBattles:2});
 const first=selector.resolve({playerLevel:1,battleToken:'old'});
 const retained=selector.resolve({playerLevel:100,battleToken:'retained'});
 selector.resolve({playerLevel:300,battleToken:'latest'});
 assert.deepEqual(selector.resolve({playerLevel:500,battleToken:'retained'}),retained);
 const revisited=selector.resolve({playerLevel:200,battleToken:'old'});
 assert.ok(pools[200].includes(revisited.id));
 assert.notEqual(revisited.id,first.id);
});
