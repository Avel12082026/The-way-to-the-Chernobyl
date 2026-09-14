const {test}=require('node:test'),assert=require('node:assert/strict');
const {shouldFlash}=require('../images/combat/effects.js');
test('flash only during the first 90ms of a confirmed shot',()=>{assert.equal(shouldFlash({shot:true},0,1),true);assert.equal(shouldFlash({shot:true},89,1),true);for(const elapsed of [-1,90,500])assert.equal(shouldFlash({shot:true},elapsed,1),false);});
test('no flash for other actions, no reaction, or uncalibrated weapon',()=>{assert.equal(shouldFlash({shot:false},20,1),false);assert.equal(shouldFlash(null,20,1),false);assert.equal(shouldFlash({shot:true},20,999),false);});
