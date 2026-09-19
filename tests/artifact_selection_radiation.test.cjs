'use strict';
const assert=require('node:assert/strict');
const model=require('../server_patches/artifact-selection-radiation.cjs');

assert.equal(model.version,'20260920.1');

const step=(a,b,cap=999)=>model.mergeStats(a,b,{perStatCap:cap});

// Harmful Radiation +N is stored as radiationLeak, improves toward zero by 1,
// stays harmful, and disappears instead of becoming a positive property.
assert.deepEqual(step({radiationLeak:-5},{}),{radiationLeak:-4});
assert.deepEqual(step({radiationLeak:-2},{}),{radiationLeak:-1});
assert.deepEqual(step({radiationLeak:-1},{}),{});
assert.deepEqual(step({radiationLeak:1},{}),{},'legacy positive leak must also reach zero, not flip');
assert.deepEqual(step({radiationLeak:5},{}),{radiationLeak:-4},'legacy sign is canonicalized as harmful');

// Two harmful parents keep the worse harmful magnitude, then improve it by one.
assert.deepEqual(step({radiationLeak:-5},{radiationLeak:-3}),{radiationLeak:-4});

// Radioprotection is a separate positive property and uses the normal positive merge/cap.
assert.deepEqual(step({radiation:3},{radiation:4}),{radiation:7});
assert.deepEqual(step({radiation:8},{radiation:9},12),{radiation:12});
assert.deepEqual(step({radiation:-9},{radiation:4}),{radiation:4},'malformed negative radioprotection cannot become harmful radiation');

// The two radiation mechanics never convert into one another.
assert.deepEqual(
  step({radiationLeak:-3,radiation:2},{radiation:4}),
  {radiationLeak:-2,radiation:6}
);
assert.deepEqual(
  step({radiationLeak:-1,radiation:2},{radiation:4}),
  {radiation:6},
  'harmful radiation key must disappear at zero while radioprotection remains'
);

// Other selection stats retain the established behavior.
assert.deepEqual(step({health:4},{health:5}),{health:9});
assert.deepEqual(step({health:-3},{health:10}),{health:-2});
assert.deepEqual(step({health:-1},{health:10}),{health:1});

console.log('PASS: artifact selection keeps Radioprotection separate; Radiation +N decreases to zero and disappears');
