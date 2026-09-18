from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'tools/install_quest_balance_server.py';s=p.read_text()
s=s.replace('import hashlib, os,', 'import argparse, json, hashlib, os,')
s=s.replace("MARK='// QUEST_BALANCE_V1'", """MARK='// QUEST_BALANCE_V2'
# Release gate: legacy equipment/capacity migration and whole-economy simulation
# have not been approved. The default is a read-only preflight, never a restart.
LIVE_DEPLOYMENT_READY=False
KNOWN_SERVER_SHA256={
    '975ce098ce2853f2520be1a65c1806a7e7b06822ac437ea2ea8b096476f18068',
    'c5d1bbec86d084d2aff46f94c9400a09e11ef9e96e3c65bb9c31821c17f9ad39',
}
OLD_RAID_END=\"\"\"app.post('/api/raid/end',requireAuth,(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    const sess=raidSession(playerId,token);if(!sess)return res.json({success:false,error:'Рейд не найден'});
    if(sess.pending_type)return res.json({success:false,error:'Сначала завершите текущую встречу'});
    db.prepare('DELETE FROM raid_sessions WHERE player_id=?').run(playerId);
    db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
    return res.json({success:true});
});\"\"\"
NEW_RAID_END=\"\"\"app.post('/api/raid/end',requireAuth,(req,res)=>{
    const playerId=String(req.telegramUser.id),token=String(req.body?.raidToken||'');
    try {
        const result=db.transaction(()=>{
            const sess=raidSession(playerId,token);
            if(!sess)return {success:false,error:'Рейд не найден'};
            if(sess.pending_type)return {success:false,error:'Сначала завершите текущую встречу'};
            questBalance.markRaidReturn(playerId);
            db.prepare('DELETE FROM raid_sessions WHERE player_id=? AND token=?').run(playerId,token);
            db.prepare('DELETE FROM pve_battles WHERE player_id=?').run(playerId);
            return {success:true};
        })();
        return res.json(result);
    } catch(error) {
        console.error('[/api/raid/end]',error);
        return res.status(500).json({success:false,error:'Не удалось завершить рейд. Повторите попытку.'});
    }
});\"\"\"
OLD_DEFENSE='''        const reduction=defense/(defense+100);
        damage=Math.round(Math.max(0,(Number(payload.dmg)||0)*(1-reduction))*10)/10;'''
NEW_DEFENSE='''        const safeDefense=Number.isFinite(defense)?defense:0;
        // Negative resistance increases damage; it never creates a singularity or immunity.
        const multiplier=safeDefense>=0?100/(100+safeDefense):1+Math.min(150,-safeDefense)/100;
        damage=Math.round(Math.max(0,Number(payload.dmg)||0)*multiplier*10)/10;'''
OLD_UPGRADE_GUARD='''    const statLevel = Number((data.armorUpgradeData[stableKey] && data.armorUpgradeData[stableKey][statKey]) || 0);
    if (statLevel >= UPGRADE_MAX_LEVEL) return res.json({ success: false, error: 'Эта характеристика уже улучшена до максимума' });'''
NEW_UPGRADE_GUARD='''    const upgradeRecord=data.armorUpgradeData[stableKey]||{};
    const statLevel = Number(upgradeRecord[statKey]) || 0;
    const totalUpgrades=Math.max(parsed.level,Object.values(upgradeRecord).reduce((n,x)=>n+(Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):0),0));
    if (totalUpgrades >= UPGRADE_MAX_LEVEL) return res.json({ success: false, error: 'Достигнут общий предел: 50 улучшений предмета' });
    if (!isCoreStat && statKey!=='radiation' && !RAID_ANOMALIES.some(a=>'anomaly_'+a.name===statKey))
        return res.json({success:false,error:'Неизвестная характеристика брони'});'''
""")
s=s.replace("    if MARK in source: return source,False", "    if '// QUEST_BALANCE_V1' in source: raise RuntimeError('Обнаружен старый экспериментальный патч. Требуется отдельная миграция; автоматическая замена запрещена.')\n    if MARK in source: return source,False")
a=s.index("    text=replace_once(\n        text,\n        \"    db.prepare('DELETE FROM pve_battles")
b=s.index('    insertion=',a)
s=s[:a]+'''    text=replace_once(text,OLD_RAID_END,NEW_RAID_END,'атомарное возвращение из рейда')
    text=replace_once(text,OLD_DEFENSE,NEW_DEFENSE,'отрицательная защита без бессмертия')
    text=replace_once(text,OLD_UPGRADE_GUARD,NEW_UPGRADE_GUARD,'общий бюджет 50 улучшений брони')
    text=replace_once(text,
        '    const lvl = Math.max(0, Number(level) || 0);',
        '    const lvl = Math.min(UPGRADE_MAX_LEVEL, Math.max(0, Number(level) || 0));',
        'ограничение нулевых исходных характеристик')

'''+s[b:]
s=s.replace("body=r.read().decode('utf-8','replace')\n            return r.status==200 and '\"success\":true' in body and '\"version\":1' in body", "body=json.load(r)\n            return r.status==200 and body.get('success') is True and body.get('version')==2")
s=s.replace("def main():\n    if os.geteuid()!=0", """def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('module',nargs='?',default='/tmp/quest-balance.cjs')
    parser.add_argument('--install',action='store_true',help='Install only after the release gate is lifted')
    parser.add_argument('--dry-run',action='store_true',help='Validate without modifying code, profiles or the service')
    args=parser.parse_args()
    if args.install and not LIVE_DEPLOYMENT_READY:
        raise RuntimeError('Установка закрыта: не завершена проверка переноса старых улучшений и характеристик артефактов. Доступен только --dry-run.')
    if os.geteuid()!=0""")
s=s.replace("module_source=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/quest-balance.cjs').resolve(strict=True)", "module_source=Path(args.module).resolve(strict=True)")
s=s.replace("raw=server.read_bytes();source=raw.decode('utf-8')", "raw=server.read_bytes();source=raw.decode('utf-8')\n    if sha(raw) not in KNOWN_SERVER_SHA256 and MARK not in source:\n        raise RuntimeError('Версия server.js не совпадает с проверенной. Ничего не изменено.')")
s=s.replace("if not changed and health():", "if not changed and (server.parent/MODULE_NAME).is_file() and (server.parent/MODULE_NAME).read_bytes()==module_raw and health():")
s=s.replace("    stamp=time.strftime", """    if args.dry_run or not args.install:
        source_db=sqlite3.connect(database.as_uri()+'?mode=ro',uri=True,timeout=10)
        try:
            summary={'profiles':0,'profilesWithUpgradesOver50':0,'profilesWithEquippedArtifacts':0}
            import re
            for (raw_data,) in source_db.execute('SELECT data FROM players'):
                data=json.loads(raw_data);summary['profiles']+=1
                names=list((data.get('inventory') or {}).keys())+list((data.get('warehouse') or {}).keys())
                names += [str((data.get(k) or {}).get('name','')) for k in ('weapon','armor')]
                over=any(int(m.group(1))>50 for name in names if (m:=re.search(r' \\+(\\d+)[\\u200B\\u200C]*$',name)))
                over=over or any(sum(max(0,float(v)) for v in stats.values())>50 for stats in (data.get('armorUpgradeData') or {}).values() if isinstance(stats,dict))
                summary['profilesWithUpgradesOver50']+=int(over)
                summary['profilesWithEquippedArtifacts']+=int(any(data.get('artifactSlots') or []))
            summary['activeRaids']=source_db.execute('SELECT COUNT(*) FROM raid_sessions').fetchone()[0]
        finally:source_db.close()
        print(json.dumps({'mode':'READ_ONLY','syntax':'passed','releaseReady':LIVE_DEPLOYMENT_READY,'sourceSha256':sha(raw),'patchedSha256':sha(new_source.encode()),'summary':summary},ensure_ascii=False,indent=2))
        print('Файлы, игровые профили и служба не изменялись. Это проверка, не установка.')
        return

    stamp=time.strftime""")
s=s.replace("    owner=server.stat()", """    if server.read_bytes()!=raw:
        raise RuntimeError('server.js изменился во время проверки; установка остановлена.')
    owner=server.stat()""")
s=s.replace("print('ГОТОВО: задания, баланс +50, исследовательская броня, ранний PvE и редкость артефактов установлены.')", "print('Код установлен, API заданий версии 2 отвечает. Проверьте клиентскую версию перед допуском игроков.')")
p.write_text(s)
p=ROOT/'tests/install_quest_balance_patch.test.py';t=p.read_text();a=t.index("    db.prepare('DELETE FROM pve_battles WHERE player_id=?')");b=t.index("app.listen(PORT, () => {",a)
t=t[:a]+"\"\"\"+mod.OLD_RAID_END+mod.OLD_DEFENSE+mod.OLD_UPGRADE_GUARD+'''\n    const lvl = Math.max(0, Number(level) || 0);\n'''+\"\"\"\n"+t[b:]
t=t.replace("assert 'questBalance.markRaidReturn(playerId)' in patched", "assert 'questBalance.markRaidReturn(playerId)' in patched\nassert mod.NEW_RAID_END in patched\nassert mod.NEW_DEFENSE in patched\nassert mod.NEW_UPGRADE_GUARD in patched\nassert not mod.LIVE_DEPLOYMENT_READY")
t+='''
try:
    mod.patch(source+"\\n"+mod.OLD_DEFENSE)
    raise AssertionError('ambiguous anchors accepted')
except RuntimeError:pass
try:
    mod.patch('// QUEST_BALANCE_V1')
    raise AssertionError('unreviewed V1 upgrade accepted')
except RuntimeError:pass
print('Atomic return, finite defense, total +50 cap, dry-run gate and ambiguous-anchor rejection: OK')
'''
p.write_text(t)
import hashlib
for name,digest in {
 'tools/install_quest_balance_server.py':'f9d7d3aecbbef60d0fae5f46276562e925c8ec1d13356880069c75659f2bc9dc',
 'tests/install_quest_balance_patch.test.py':'aeeccf1d9ee1b4723c0a49268398385815f4c15138901e454a30458caa0c3835'
}.items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
