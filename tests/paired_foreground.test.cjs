const test=require('node:test'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const renderer=require('../images/combat/paired-foreground.js');
const effects=require('../images/combat/effects.js');
const image=createCanvas(100,100),ic=image.getContext('2d');ic.fillStyle='#777';ic.fillRect(40,20,30,80);
const profile={x:50,y:50,scale:1,muzzle:[40,20],angle:-2.47,weaponId:9,suppressed:false};
function frame(options){const c=createCanvas(240,240);renderer.draw(c.getContext('2d'),image,profile,options,effects);return c.getContext('2d').getImageData(0,0,240,240).data;}
test('ready frame and completed shot are pixel-identical',()=>assert.deepEqual(frame({}),frame({shot:true,elapsed:240})));
test('reduced motion preserves ready foreground',()=>assert.deepEqual(frame({}),frame({shot:true,elapsed:40,reducedMotion:true})));
test('shot differs while transparent corner stays empty',()=>{const ready=frame({}),shot=frame({shot:true,elapsed:40});assert.notDeepEqual(ready,shot);assert.equal(shot[3],0);});
test('maximum recoil and return',()=>{assert.equal(renderer.recoilY(110),12);assert.equal(renderer.recoilY(220),0);assert.equal(renderer.recoilY(-1),0);});
