#!/usr/bin/env python3
from pathlib import Path
import argparse, json, re, shutil, subprocess, sys, time

def build(src: str) -> str:
    m=re.search(r"const SHOP_CONSUMABLES = (\[[^\n]+\]);",src)
    if not m: raise SystemExit("SHOP_CONSUMABLES not found")
    items=json.loads(m.group(1))
    by={x["name"]:x for x in items}
    by["Аптечка научная"]["price"]=6000
    by["Аптечка научная"]["instantHeal"]=True
    by["Антирад"]["foodCost"]=25
    by["Антирад"]["waterCost"]=25
    if "Водка Столичная" not in by:
        items.append({"name":"Водка Столичная","type":"vodka","radiationRemove":50,"foodCost":50,"waterCost":50,"price":100})
    else:
        by["Водка Столичная"].update(type="vodka",radiationRemove=50,foodCost=50,waterCost=50,price=100)
    encoded=json.dumps(items,ensure_ascii=False,separators=(",",":"))
    out=src[:m.start(1)]+encoded+src[m.end(1):]

    old="const ZHUCHARA_CONSUMABLES_SERVER=new Set([\n    'Хлеб','Вода','Аптечка гражданская'\n]);"
    new="const ZHUCHARA_CONSUMABLES_SERVER=new Set([\n    'Хлеб','Вода','Аптечка гражданская','Водка Столичная'\n]);"
    if old not in out and new not in out: raise SystemExit("Zhuchara consumable set anchor not found")
    out=out.replace(old,new)

    out=out.replace(
        "У Жучары из припасов продаются только хлеб, вода и гражданская аптечка",
        "У Жучары из припасов продаются хлеб, вода, гражданская аптечка и Водка Столичная"
    )

    old_markup="if (item && (item.type === 'medkit' || item.type === 'antirad')) markup = 1.01;"
    new_markup="if (item && (item.type === 'medkit' || item.type === 'antirad' || item.type === 'vodka')) markup = 1.01;"
    if old_markup not in out and new_markup not in out: raise SystemExit("shop markup anchor not found")
    out=out.replace(old_markup,new_markup)

    old_apply="""    if(item.type==='medkit'){
        const total=Math.max(0,Number(item.restore)||0),per=Math.ceil(total/MEDKIT_HEAL_TICKS);
        data.healingEffect={itemName:item.name,totalRestore:total,remainingRestore:total,
            healPerTick:per,ticksRemaining:MEDKIT_HEAL_TICKS,lastTickAt:Date.now(),vitalityGranted:false};
    }
    if(item.type==='antirad'){
        data.hunger=Math.max(0,(Number(data.hunger)||0)-(Number(item.foodCost)||0));
        data.thirst=Math.max(0,(Number(data.thirst)||0)-(Number(item.waterCost)||0));
    }"""
    new_apply="""    if(item.type==='medkit'){
        const total=Math.max(0,Number(item.restore)||0);
        if(item.instantHeal){
            const maxHealth=Math.max(1,Number(data.maxHealth)||100);
            const before=Math.max(0,Number(data.health)||0);
            data.health=Math.min(maxHealth,before+total);
            const healed=Math.max(0,Math.round((data.health-before)*10)/10);
            if(healed>0){
                const prev=Math.max(0,Number(data.vitality)||0);
                data.vitality=Math.min(100,prev+0.1);
                data.maxHealth=(Number(data.maxHealth)||100)+(data.vitality-prev);
            }
            delete data.healingEffect;
        }else{
            const per=Math.ceil(total/MEDKIT_HEAL_TICKS);
            data.healingEffect={itemName:item.name,totalRestore:total,remainingRestore:total,
                healPerTick:per,ticksRemaining:MEDKIT_HEAL_TICKS,lastTickAt:Date.now(),vitalityGranted:false};
        }
    }
    if(item.type==='antirad'||item.type==='vodka'){
        data.hunger=Math.max(0,(Number(data.hunger)||0)-(Number(item.foodCost)||0));
        data.thirst=Math.max(0,(Number(data.thirst)||0)-(Number(item.waterCost)||0));
    }"""
    if old_apply not in out and new_apply not in out: raise SystemExit("pve consumable apply anchor not found")
    out=out.replace(old_apply,new_apply)

    required=[
      '"name":"Аптечка научная","type":"medkit","restore":150,"radiationRemove":100,"price":6000,"instantHeal":true',
      '"name":"Антирад","type":"antirad","radiationRemove":100,"foodCost":25,"waterCost":25,"price":200',
      '"name":"Водка Столичная","type":"vodka","radiationRemove":50,"foodCost":50,"waterCost":50,"price":100',
      "'Водка Столичная'",
      "item.type==='vodka'",
      "item.instantHeal"
    ]
    for x in required:
        if x not in out: raise SystemExit("missing transformed marker: "+x)
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("target",nargs="?",default="/var/www/pocketzone/server.js")
    ap.add_argument("--check",action="store_true")
    args=ap.parse_args()
    p=Path(args.target)
    src=p.read_text(encoding="utf-8")
    out=build(src)
    if args.check:
        print("CHECK_OK")
        return
    backup=p.with_name(p.name+".before-consumables-"+time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(p,backup)
    p.write_text(out,encoding="utf-8")
    chk=subprocess.run(["node","--check",str(p)],capture_output=True,text=True)
    if chk.returncode:
        shutil.copy2(backup,p)
        sys.stderr.write(chk.stderr)
        raise SystemExit("node --check failed; rolled back")
    print("UPDATED",p)
    print("BACKUP",backup)

if __name__=="__main__":
    main()
