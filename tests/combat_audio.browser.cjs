'use strict';
// Real Chromium playback/decode smoke test. No live game, player or database.
// The six remote ambient URLs use a local quiet PCM tone: this verifies the real
// HTMLAudio transport and independent buses, not the external soundtrack files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, process.cwd()].filter(Boolean) }));
const root = path.resolve(__dirname, '..');
const bank = require(path.join(root, 'audio/combat-sounds.js'));

function transportTone() {
  const sampleRate = 22050, samples = sampleRate * 60;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(500 * Math.sin(i * 2 * Math.PI * 220 / sampleRate)), 44 + i * 2);
  return wav;
}

const fixture = `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/audio/menu-music.css"><title>Combat audio smoke fixture</title>
<div id="mainMenu"><button id="trustedUnlock" style="min-height:48px">Начать</button></div>
<script>
window.SERVER_URL=location.origin;
window.__starts=[];window.__ends=[];window.__sourceSequence=0;window.__pulses=[];window.__rendered=[];window.__originalCalls=[];window.__trustedPointer=false;
document.addEventListener('pointerdown',event=>{window.__trustedPointer=event.isTrusted;},{capture:true});
const NativeAudio=window.Audio;
window.Audio=function(...args){const audio=new NativeAudio(...args);window.__musicAudio=audio;return audio;};
window.Audio.prototype=NativeAudio.prototype;
const originalCreate=AudioContext.prototype.createBufferSource;
AudioContext.prototype.createBufferSource=function(...args){
 const source=originalCreate.apply(this,args),start=source.start;let record;
 source.addEventListener('ended',()=>{if(record)window.__ends.push({id:record.id,at:performance.now()});});
 source.start=function(...params){record={id:++window.__sourceSequence,at:performance.now(),duration:source.buffer?.duration,rate:source.playbackRate.value};window.__starts.push(record);return start.apply(this,params);};
 return source;
};
window.CombatScene={show(next){__originalCalls.push(['show',next]);return true;},pulse(token,side){__pulses.push({token,side,at:performance.now()});return true;},react(...args){__originalCalls.push(['react',...args]);__rendered.push({at:performance.now(),externalShots:args[3]?.externalShots});return 'visual';},hide(){__originalCalls.push(['hide']);}};
</script>
<script src="/audio/combat-sounds.js"></script><script src="/audio/combat-audio.js"></script>
<script src="/audio/menu-music.js"></script>
<script>CombatScene.show({weaponId:1,enemy:{battleToken:'browser-fight',kind:'npc'},enemyGear:{weaponId:12}});</script>
</html>`;

async function main() {
  const tone = transportTone(), failedRequests = [], errors = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/' || pathname === '/fixture') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
    if (/^\/audio\/zone-ambient-0[1-6]\.mp3$/.test(pathname)) { res.setHeader('Content-Type', 'audio/wav'); res.setHeader('Content-Length', tone.length); res.end(tone); return; }
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Missing fixture asset'); return; }
    const types = { '.js': 'application/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Content-Length', fs.statSync(file).size); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failedRequests.push(response.url() + ' ' + response.status()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/fixture');
    await page.waitForFunction(() => window.CombatAudio && document.querySelector('#combatSoundEnabled'));
    assert.equal(await page.evaluate(() => CombatAudio.getState().contextState), 'suspended', 'Effects must wait for a real gesture');
    assert.equal(await page.evaluate(() => CombatAudio.play(1)), false);

    await page.click('#trustedUnlock');
    await page.waitForFunction(() => CombatAudio.getState().contextState === 'running' && !__musicAudio.paused && __musicAudio.currentTime > .05);
    assert.equal(await page.evaluate(() => __trustedPointer), true, 'Unlock came from an actual browser input event');

    const decoded = await page.evaluate(async () => {
      const context = new AudioContext(), results = [];
      const files = [...new Set(Object.values(COMBAT_SOUND_BANK.profiles).flatMap(profile => profile.files))];
      for (const file of files) {
        const response = await fetch('/audio/gunshots/' + file);
        if (!response.ok) throw Error('Cannot fetch ' + file);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const samples = buffer.getChannelData(channel);
          for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
        }
        results.push({ file, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, peak });
      }
      await context.close(); return results;
    });
    const files = new Set(Object.values(bank.profiles).flatMap(profile => profile.files));
    assert.equal(decoded.length, files.size);
    for (const sound of decoded) {
      assert(Number.isFinite(sound.duration) && sound.duration > 0, sound.file + ' decodes with a duration');
      assert(sound.channels > 0 && sound.sampleRate >= 8000, sound.file + ' has valid PCM');
      assert(sound.peak > .005, sound.file + ' must not be silent');
    }

    await page.evaluate(() => Promise.all([CombatAudio.preload(1), CombatAudio.preload(12)]));
    const overlap = await page.evaluate(async () => {
      CombatAudio.stop(); __starts.length = 0;
      const musicBefore = __musicAudio.currentTime;
      const played = await Promise.all([CombatAudio.play(1), CombatAudio.play(12), CombatAudio.play(1)]);
      const activeVoices = CombatAudio.getState().activeVoices;
      await new Promise(resolve => setTimeout(resolve, 180));
      return { played, activeVoices, starts: __starts.length, musicBefore, musicAfter: __musicAudio.currentTime, musicPaused: __musicAudio.paused };
    });
    assert.deepEqual(overlap.played, [true, true, true]);
    assert(overlap.activeVoices >= 2 && overlap.starts === 3, 'Independent real BufferSources overlap');
    assert(!overlap.musicPaused && overlap.musicAfter > overlap.musicBefore + .08, 'Background HTMLAudio advances while shots overlap');

    await page.click('#menuMusicButton');
    assert(await page.locator('#menuMusicPanel').evaluate(element => element.open));
    await page.locator('#combatSoundEnabled').uncheck();
    const mutedEffects = await page.evaluate(async () => {
      const time = __musicAudio.currentTime;
      const played = await CombatAudio.play(1);
      await new Promise(resolve => setTimeout(resolve, 160));
      return { played, active: CombatAudio.getState().activeVoices, timeAdvanced: __musicAudio.currentTime - time, musicPaused: __musicAudio.paused };
    });
    assert(!mutedEffects.played && mutedEffects.active === 0);
    assert(!mutedEffects.musicPaused && mutedEffects.timeAdvanced > .07, 'Muting effects leaves soundtrack playing');

    await page.locator('#combatSoundEnabled').check();
    await page.locator('#menuMusicEnabled').uncheck();
    const mutedMusic = await page.evaluate(async () => ({ musicPaused: __musicAudio.paused, played: await CombatAudio.play(1), active: CombatAudio.getState().activeVoices }));
    assert(mutedMusic.musicPaused && mutedMusic.played && mutedMusic.active > 0, 'Muting soundtrack leaves effects playable');

    await page.locator('#menuMusicEnabled').check();
    await page.waitForFunction(() => !__musicAudio.paused);
    const burstCases = [[86, 3, 'pistol'], [17, 6, 'machine gun'], [13, 2, 'rifle'], [4, 2, 'sawed-off'], [10, 3, 'repeating shotgun']];
    const burstReports = [];
    for (const [weaponId, shots, kind] of burstCases) {
      assert.equal(bank.weapons[weaponId].burst.shots, shots, kind + ' catalog burst');
      const burst = await page.evaluate(async ({ weaponId }) => {
        CombatAudio.stop();
        const token = 'burst-' + weaponId;
        CombatScene.show({ weaponId, enemy: { battleToken: token, kind: 'npc' }, enemyGear: { weaponId: 0 } });
        await CombatAudio.preload(weaponId);
        __starts.length = 0; __ends.length = 0; __pulses.length = 0; __rendered.length = 0;
        const musicBefore = __musicAudio.currentTime, startedAt = performance.now();
        let hp = 100, dead = false;
        const result = { success: true, playerDamage: 100, victoryReady: true };
        const completion = CombatScene.react(token, result, 'attack');
        const duplicate = CombatScene.react(token, result, 'attack');
        const before = { hp, dead, renders: __rendered.length };
        const status = await completion;
        // Models the client's awaited state-application boundary; the real client
        // request count and database behavior are tested separately.
        hp = 0; dead = true;
        return { status, samePromise: completion === duplicate, before, hp, dead, startedAt, completedAt: performance.now(), starts: __starts.slice(), ends: __ends.filter(end=>__starts.some(start=>start.id===end.id)), pulses: __pulses.slice(), rendered: __rendered.slice(), musicBefore, musicAfter: __musicAudio.currentTime, musicPaused: __musicAudio.paused, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }, { weaponId });
      assert.equal(burst.samePromise, true, kind + ' duplicate result shares completion');
      assert.deepEqual(burst.before, { hp: 100, dead: false, renders: 0 }, kind + ' preserves the live enemy while the burst is pending');
      assert.equal(burst.status.cancelled, false); assert.equal(burst.hp, 0); assert.equal(burst.dead, true);
      assert.equal(burst.starts.length, shots, kind + ' real source count');
      assert.equal(burst.ends.length, shots, kind + ' completion waits for every actual source end');
      assert.equal(burst.pulses.length, shots, kind + ' flash count');
      assert.equal(burst.rendered.length, 1, kind + ' applies visual result once');
      assert.equal(burst.rendered[0].externalShots, true, kind + ' suppresses the old single-shot renderer');
      for (let i = 0; i < shots; i++) {
        assert.equal(burst.pulses[i].side, 'player');
        assert(Math.abs(burst.pulses[i].at - burst.starts[i].at) < 35, kind + ' flash starts with its real sound');
        const end = burst.ends.find(item => item.id === burst.starts[i].id);
        assert(end.at - burst.starts[i].at >= burst.starts[i].duration / burst.starts[i].rate * 1000 - 80, kind + ' does not cut off an earlier shot tail');
        if (i) assert(Math.abs(burst.starts[i].at - burst.starts[i - 1].at - bank.weapons[weaponId].burst.intervalMs) < 80, kind + ' follows its catalog cadence');
      }
      const lastEnd = Math.max(...burst.ends.map(end => end.at));
      assert(burst.rendered[0].at >= lastEnd - 5, kind + ' renderer waits for full audio tails');
      assert(burst.completedAt >= burst.rendered[0].at, kind + ' caller may apply HP only after renderer completion');
      assert(burst.completedAt >= burst.pulses.at(-1).at + 100, kind + ' final muzzle flash completes first');
      assert(!burst.musicPaused && burst.musicAfter > burst.musicBefore + .3, kind + ' does not interrupt soundtrack transport');
      assert(burst.reducedMotion, 'Burst coordinator remains active with reduced motion');
      burstReports.push({ weaponId, kind, shots, intervalMs: bank.weapons[weaponId].burst.intervalMs, completionMs: Math.round(burst.completedAt - burst.startedAt) });
    }

    for (const [playerWeapon, enemyWeapon] of [[86, 13], [17, 17]]) {
    const playerShots = bank.weapons[playerWeapon].burst.shots, enemyShots = bank.weapons[enemyWeapon].burst.shots;
    const npc = await page.evaluate(async ({ playerWeapon, enemyWeapon }) => {
      CombatAudio.stop();
      CombatScene.show({ weaponId: playerWeapon, enemy: { battleToken: 'npc-burst', kind: 'npc' }, enemyGear: { weaponId: enemyWeapon } });
      await Promise.all([CombatAudio.preload(playerWeapon), CombatAudio.preload(enemyWeapon)]);
      __starts.length = 0; __ends.length = 0; __pulses.length = 0; __rendered.length = 0;
      const result = { success: true, playerDamage: 0, enemyTurn: { hit: false, damage: 0 } };
      const completion = CombatScene.react('npc-burst', result, 'attack');
      const samePromise = completion === CombatScene.react('npc-burst', result, 'attack');
      const status = await completion;
      return { status, samePromise, starts: __starts.slice(), ends: __ends.filter(end=>__starts.some(start=>start.id===end.id)), pulses: __pulses.slice(), rendered: __rendered.slice() };
    }, { playerWeapon, enemyWeapon });
    assert(npc.samePromise); assert.equal(npc.status.cancelled, false);
    assert.equal(npc.starts.length, playerShots + enemyShots); assert.equal(npc.ends.length, playerShots + enemyShots); assert.equal(npc.pulses.length, playerShots + enemyShots); assert.equal(npc.rendered.length, 1);
    assert.deepEqual(npc.pulses.map(pulse => pulse.side), [...Array(playerShots).fill('player'), ...Array(enemyShots).fill('enemy')]);
    const replyDelay = npc.pulses[playerShots].at - npc.pulses[playerShots - 1].at;
    assert(replyDelay >= 200 && replyDelay < 500, 'NPC series begins after the final player shot plus its reply delay');
    for (let i = 0; i < npc.starts.length; i++) {
      assert(Math.abs(npc.pulses[i].at - npc.starts[i].at) < 35, 'NPC and player flashes match real sound starts');
      const end = npc.ends.find(item => item.id === npc.starts[i].id);
      assert(end.at - npc.starts[i].at >= npc.starts[i].duration / npc.starts[i].rate * 1000 - 80, 'Both six-shot machine-gun bursts retain every audio tail');
    }
    }

    await page.locator('#combatSoundEnabled').uncheck();
    const silentBurst = await page.evaluate(async () => {
      CombatAudio.stop();
      CombatScene.show({ weaponId: 17, enemy: { battleToken: 'silent-burst', kind: 'npc' }, enemyGear: { weaponId: 0 } });
      __starts.length = 0; __pulses.length = 0; __rendered.length = 0;
      const musicBefore = __musicAudio.currentTime;
      const status = await CombatScene.react('silent-burst', { success: true, playerDamage: 100, victoryReady: true }, 'attack');
      return { status, starts: __starts.length, pulses: __pulses.slice(), renders: __rendered.length, completedAt: performance.now(), musicBefore, musicAfter: __musicAudio.currentTime };
    });
    assert.equal(silentBurst.status.cancelled, false); assert.equal(silentBurst.starts, 0);
    assert.equal(silentBurst.pulses.length, 6); assert.equal(silentBurst.renders, 1);
    assert(silentBurst.completedAt >= silentBurst.pulses.at(-1).at + 60, 'Muting effects preserves the complete visual burst');
    assert(silentBurst.musicAfter > silentBurst.musicBefore + .3, 'Muted effects do not interrupt soundtrack');
    await page.locator('#combatSoundEnabled').check();

    const hiddenReply = await page.evaluate(async () => {
      CombatAudio.stop();
      CombatScene.show({ weaponId: 86, enemy: { battleToken: 'cancel-burst', kind: 'npc' }, enemyGear: { weaponId: 13 } });
      __starts.length = 0; __pulses.length = 0;
      const completion = CombatScene.react('cancel-burst', { success: true, playerDamage: 5, enemyTurn: { hit: true, damage: 4 } }, 'attack');
      const deadline = performance.now() + 1000;
      while (!__starts.length && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      CombatScene.hide();
      const status = await completion;
      await new Promise(resolve => setTimeout(resolve, 350));
      return { status, count: __starts.length, pulses: __pulses.length, pending: CombatAudio.getState().pendingShots };
    });
    assert.deepEqual(hiddenReply, { status: { cancelled: true }, count: 1, pulses: 1, pending: 0 }, 'Hiding battle settles the caller and cancels every future shot and flash');

    for (const [selector, value] of [['#combatSoundVolume', '37'], ['#menuMusicVolume', '41']]) {
      await page.locator(selector).evaluate((element, next) => { element.value = next; element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    }
    await page.locator('#menuMusicEnabled').check();
    await page.setViewportSize({ width: 320, height: 480 });
    const mobile = await page.locator('#menuMusicPanel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
    });
    assert(mobile.left >= 0 && mobile.right <= mobile.width && mobile.top >= 0 && mobile.bottom <= mobile.height, 'Settings panel stays inside a 320x480 viewport');
    assert(mobile.scrollWidth <= mobile.clientWidth + 1, 'Settings have no horizontal overflow');
    await page.locator('#menuMusicClose').click();
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#combatSoundVolume'));
    assert.deepEqual(await page.evaluate(() => CombatAudio.getSettings()), { enabled: true, volume: .37 });
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('zone.menuMusic'))), { enabled: true, volume: .41 });
    assert.equal(await page.locator('#combatSoundVolume').inputValue(), '37');
    assert.equal(await page.locator('#menuMusicVolume').inputValue(), '41');
    assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
    console.log(JSON.stringify({ passed: true, realMp3FilesDecoded: decoded.length, soundFamilies: Object.keys(bank.profiles).length, firearmsMapped: Object.keys(bank.weapons).length, trustedGestureUnlock: true, overlappingEffects: true, independentMusicAndEffects: true, bursts: burstReports, realSoundAndFlashTiming: true, stateApplicationAfterFullAudioTails: true, npcDelayAndCancellation: true, reducedMotion: true, settingsPersistence: true, mobileViewport: '320x480', musicFixture: '60-second local PCM transport tone; production ambient files not exercised' }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
