// Run: node tests/chat_pda_structure.cjs [path/to/index.html]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const count = text => html.split(text).length - 1;
assert.equal(count('id="embeddedChatWidget"'), 1, 'Keep a single existing widget');
assert.equal(count('id="chatScreen"'), 1);
assert.equal(count('id="kpkChatBtn"'), 1);
assert.equal(count('id="chatBackToKpkBtn"'), 1);
assert(!html.includes('mainMenuChatSlot'), 'Main-menu chat slot must be removed');
assert(!html.includes('raidChatSlot'), 'Raid chat slot must be removed');
assert.match(html, /id="kpkChatBtn"[^>]*onclick="openScreen\('chat'\)"[^>]*>Телеграммка/);
assert.match(html, /id="chatBackToKpkBtn"[^>]*onclick="openScreen\('kpk'\)"[^>]*>Назат/);
assert(html.indexOf('id="chatScreen"') < html.indexOf('id="embeddedChatWidget"'));
const startup = html.match(/function initChatOnFirstLoad\(\) \{([\s\S]*?)\n    \}/)[1];
assert(!startup.includes('openChatTab'), 'Do not load/mark messages read on startup');
assert(startup.includes("style.display = 'none'"));
const profileDm = html.match(/function messagePlayerFromProfile\(playerId\) \{([\s\S]*?)\n    \}/)[1];
assert(profileDm.includes("openScreen('chat')"));
assert(!profileDm.includes("openScreen('main')"));
for (const endpoint of ['general/send', 'faction/send', 'dm/send']) {
    assert(html.includes('/api/chat/' + endpoint), 'Preserve original chat API: ' + endpoint);
}
let scripts = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1].trim()) {
        new vm.Script(match[1], { filename: `inline-${scripts}.js` });
        scripts++;
    }
}
console.log(`PASS: PDA chat structure, original API routes, ${scripts} inline scripts parse`);
