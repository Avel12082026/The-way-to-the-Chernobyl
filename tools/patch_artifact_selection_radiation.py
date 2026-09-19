#!/usr/bin/env python3
"""Patch only artifact-selection stat merging; no database access or execution."""
from pathlib import Path
import re, sys

MARK='// ARTIFACT_SELECTION_RADIATION_20260920_V1'
REQUIRE="const ArtifactSelectionRadiation=require('./artifact-selection-radiation.cjs');"
ROUTE="app.post('/api/artifacts/breed'"

MERGE_RE=re.compile(
    r"(?P<indent>[ \t]*)const\s+allKeys\s*=\s*new\s+Set\(\[\.\.\.Object\.keys\(a1\.stats\),\s*\.\.\.Object\.keys\(a2\.stats\)\]\);\s*"
    r"const\s+mergedStats\s*=\s*\{\};\s*"
    r"allKeys\.forEach\(key\s*=>\s*\{[\s\S]*?\n(?P=indent)\}\);"
)

def route_slice(source):
    positions=[]
    pos=0
    while True:
        pos=source.find(ROUTE,pos)
        if pos<0:break
        positions.append(pos);pos+=len(ROUTE)
    if len(positions)!=1:
        raise ValueError(f'Ожидался один маршрут /api/artifacts/breed, найдено {len(positions)}')
    start=positions[0]
    candidates=[p for p in (
        source.find("\napp.post(",start+len(ROUTE)),
        source.find("\napp.get(",start+len(ROUTE)),
        source.find("\napp.listen(",start+len(ROUTE)),
    ) if p>=0]
    end=min(candidates) if candidates else len(source)
    return start,end,source[start:end]

def build(source):
    if MARK in source:
        start,end,route=route_slice(source)
        required=(
            "ArtifactSelectionRadiation.mergeStats(a1.stats,a2.stats,{perStatCap})",
            REQUIRE,
        )
        if any(x not in source for x in required):
            raise ValueError('Неполный патч селекции радиации; установка остановлена')
        return source

    start,end,route=route_slice(source)
    matches=list(MERGE_RE.finditer(route))
    if len(matches)!=1:
        raise ValueError(
            'Не найден однозначный проверенный блок объединения характеристик в /api/artifacts/breed '
            f'(найдено {len(matches)}). Ничего не изменено.'
        )
    old=matches[0].group(0)
    indent=matches[0].group('indent')
    new=(
        indent+"const mergedStats=ArtifactSelectionRadiation.mergeStats("
        "a1.stats,a2.stats,{perStatCap});"
    )
    patched_route=route.replace(old,new,1)
    if "const mergedStats=ArtifactSelectionRadiation.mergeStats(a1.stats,a2.stats,{perStatCap});" not in patched_route:
        raise ValueError('Не удалось вставить новую формулу селекции')

    prefix=MARK+"\n"+REQUIRE+"\n"
    return source[:start]+prefix+patched_route+source[end:]

if __name__=='__main__':
    src=Path(sys.argv[1]);dst=Path(sys.argv[2])
    dst.write_text(build(src.read_text(encoding='utf-8')),encoding='utf-8')
