'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const js = fs.readFileSync(path.join(__dirname, '..', 'ui', 'bunker-menu.js'), 'utf8');

const nav = js.match(/<nav class=\"leonov-actions\"[\s\S]*?<\/nav>/);
assert(nav, 'Leonov action navigation must exist');
assert.strictEqual((nav[0].match(/data-leonov-action=/g) || []).length, 2, 'Leonov must have exactly two primary actions');
assert(nav[0].includes('data-leonov-action=\"selection\"'), 'Selection action missing');
assert(nav[0].includes('data-leonov-action=\"trade\"'), 'Trade action missing');
assert(!nav[0].includes('talk'), 'Talk must not be a Leonov primary action');
assert(js.includes('class=\"leonov-back\"'), 'Back control must remain separate from the two primary actions');

assert(js.includes("heading.textContent = mode === 'selection' ? 'СЕЛЕКЦИЯ АРТЕФАКТОВ' : 'ТОРГОВЛЯ У ЛЕОНОВА'"), 'Selection/trade headings must be explicit');
assert(js.includes("placeTitle.textContent = 'ПОЛОЖИТЬ'"), 'Selection must show ПОЛОЖИТЬ');
assert(js.includes("description.textContent = '2 артефакта превращаются в 1, который объединяет их свойства'"), 'Selection explanation missing');

assert(js.includes("const eligible = name => quantity(name) > 0 && !!definition(name)"), 'All owned artifact definitions, including the named admin artifact, must be selectable');
assert(!js.includes('&& !def.isNamedArtifact'), 'Named artifact must not be filtered out');
assert(js.includes('if (aNamed !== bNamed) return aNamed ? -1 : 1'), 'Named artifact must sort before ordinary artifacts');
assert(js.includes("def?.isNamedArtifact ? ' leonov-named-artifact' : ''"), 'Named artifact must be identifiable in the inventory grid');

assert(js.includes('const hasValidPair = () => !!breedSlot1 && !!breedSlot2'), 'Two filled slots must be required');
assert(js.includes('breed.hidden = !ready && !busy'), 'Selection action must stay hidden until two artifacts are chosen');
assert(js.includes('breed.disabled = busy || !ready'), 'Selection action must stay disabled until the pair is valid');
assert(js.includes("if (!isSelection() || busy || !hasValidPair()) return"), 'Breeding must be guarded against incomplete selections');

assert(js.includes('await nativeBreed()'), 'Breeding must delegate to the original server-authoritative implementation');
assert(js.includes('return nativeBuy()'), 'Buy must delegate to the original implementation');
assert(js.includes('return nativeSell()'), 'Sell must delegate to the original implementation');

console.log('Leonov final requirements: OK');
