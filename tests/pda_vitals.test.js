const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('index.html','utf8');const fn=s.match(/    function renderProfileVitals\([^]*?^    }/m)[0];const c=vm.createContext({});vm.runInContext(fn,c);
c.data={health:0,maxHealth:150,hunger:75,maxHunger:100,thirst:120,maxThirst:100};const h=vm.runInContext('renderProfileVitals(data)',c);assert.match(h,/0 \/ 150/);assert.match(h,/75 \/ 100/);assert.match(h,/width:100%/);assert.equal((h.match(/data-vital=/g)||[]).length,3);
c.data={health:null,hunger:'<script>',thirst:NaN};assert.equal((vm.runInContext('renderProfileVitals(data)',c).match(/нет данных/g)||[]).length,3);
let helper=JSON.parse(fs.readFileSync('server_patches/pda_loadout.json')).replacements[0].new.split("app.get('/api/player/:id'")[0];const patch=JSON.parse(fs.readFileSync('server_patches/pda_vitals.json'));for(const e of patch.replacements)helper=helper.replace(e.old,e.new);
vm.runInContext(helper,c);c.full={health:0,maxHealth:150,hunger:75,maxHunger:100,thirst:25,maxThirst:100,inventory:{secret:1}};const p=JSON.parse(vm.runInContext('JSON.stringify(publicEquippedLoadout(full))',c));assert.equal(p.health,0);assert.equal(p.maxHealth,150);assert.equal(p.thirst,25);assert.equal(p.inventory,undefined);
console.log('PASS: viewed-player vitals, zero health, maxima, missing/nonfinite data and public field isolation');
