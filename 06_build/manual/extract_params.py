"""Vytáhne zkratky, názvy a nápovědu parametrů z paramMeta.ts → params.json (příloha manuálu)."""
import json, re
from pathlib import Path

SRC = Path(r"C:\MD_Personal\1.Projekty\1.Aktuální projekty\14.50-1182875_Trafag\10.Scada program\ScadaViewer\01_frontend\src\utils\paramMeta.ts")
src = SRC.read_text(encoding="utf-8")
STR = re.compile(r"(\w+):\s*'((?:[^'\\]|\\.)*)'")


def obj(name: str) -> dict:
    i = src.index(f"export const {name}")
    j = src.index("\n}", i)
    return dict(STR.findall(src[i:j]))


gi = src.index("export const PARAM_GROUPS")
gj = src.index("\n]", gi)
groups = [
    {"id": gid, "label": label, "unit": unit, "keys": re.findall(r"'(\w+)'", keys)}
    for gid, label, unit, keys in re.findall(
        r"id:\s*'(\w+)',\s*label:\s*'([^']+)',\s*unit:\s*'([^']*)'.*?keys:\s*\[(.*?)\]", src[gi:gj], re.S)
]
data = {"labels": obj("PARAM_LABELS"), "tooltips": obj("PARAM_TOOLTIPS"),
        "desc": obj("PARAM_DESC"), "desc_en": obj("PARAM_DESC_EN"), "groups": groups}
out = Path(__file__).with_name("params.json")
out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
for g in groups:
    miss = [k for k in g["keys"] if not (data["labels"].get(k) and data["desc"].get(k) and data["desc_en"].get(k))]
    print(g["label"], g["unit"], len(g["keys"]), "chybí:", miss)
print(data["tooltips"].get("of_operatingforce"))
