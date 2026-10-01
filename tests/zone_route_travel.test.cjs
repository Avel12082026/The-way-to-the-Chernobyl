const assert=require('assert');
const fs=require('fs');

const js=fs.readFileSync('ui/bunker-menu.js','utf8');
const html=fs.readFileSync('index.html','utf8');

assert(js.includes("version: '0.9.0'"),'ZoneMap route API version missing');
assert(js.includes("window.BunkerMenu = {version: '1.24.0'"),'BunkerMenu route version missing');
assert(js.includes('async function beginZoneTravelRoute(point)'),'route starter missing');
assert(js.includes("SERVER_URL+'/api/zone-route/start'"),'route start API missing');
assert(js.includes("url.replace('/api/raid/step','/api/zone-route/step')"),'raid step is not routed through travel');
assert(js.includes("SERVER_URL+'/api/zone-route/status'"),'route resume API missing');
assert(js.includes("Победы '+wins+'/'+required"),'route progress counter missing');
assert(js.includes("if(zoneTravelRoute&&!zoneTravelRoute.completed)"),'active route switching guard missing');
assert(js.includes("window.__zoneMapLegacyDirectTravelTest === true"),'legacy map test isolation missing');

const liveTransition=js.slice(
  js.indexOf("if (kind === 'transition')"),
  js.indexOf("if (!zoneRouteKinds.has(kind))")
);
assert(liveTransition.includes('await beginZoneTravelRoute(point)'),'production transition does not start route');
assert(html.includes('ui/bunker-menu.js?v=20261001-cordon-hud-sync1'),'route cache key missing');

console.log('PASS: persistent 10-battle travel route client wiring');