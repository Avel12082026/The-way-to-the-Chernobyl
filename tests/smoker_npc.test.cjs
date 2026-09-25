'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('ui/bunker-menu.html','utf8');
const css=fs.readFileSync('ui/bunker-menu.css','utf8');
const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const b64=fs.readFileSync('ui/smoker-portrait.webp.b64','utf8').trim();

assert(html.includes('id="bunkerSmoker"'),'smoking stalker hotspot missing');
assert(html.includes('onclick="BunkerMenu.openSmoker()"'),'hotspot does not open smoker portrait');
assert(index.includes('id="bunkerSmoker"'),'installed client hotspot missing');
assert(js.includes("el.id = 'smokerHubScreen'"),'portrait screen is not created');
assert(js.includes('data-smoker-action="talk"')&&js.includes('>Говорить</button>'),'Talk button missing');
assert(js.includes('data-smoker-action="back"')&&js.includes('>Назад</button>'),'Back button missing');
assert(js.includes("fetch('ui/smoker-portrait.webp.b64?v=0325614230e4')"),'approved portrait asset not loaded');
assert(js.includes("window.BunkerMenu = {version: '1.20.0'"),'BunkerMenu API version not bumped');
assert(css.includes('#smokerHubScreen .smoker-actions')&&css.includes('grid-template-columns:1fr 1fr'),'two bottom actions are not laid out side-by-side');
assert(js.includes('id="smokerHubBackdrop"'),'blurred portrait backdrop missing');
assert(css.includes('#smokerHubScreen .smoker-hub-backdrop')&&css.includes('filter:blur(18px)'),'portrait backdrop styling missing');
assert(css.includes('#smokerHubScreen .smoker-hub-artwork')&&css.includes('object-fit:contain'),'portrait must be shown without close crop');
const bytes=Buffer.from(b64,'base64');
assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF','portrait is not WebP/RIFF');
assert(bytes.length>30000,'portrait asset unexpectedly small');
assert(index.includes('ui/bunker-menu.css?v=20260925-zone-travel1'));
assert(index.includes('ui/bunker-menu.js?v=20260925-zone-travel1'));
console.log('PASS: smoking stalker opens uncropped portrait with blurred fill, Talk/Back and cache wiring');
