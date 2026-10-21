"""
Jednotky v CSV souborech — převod na jednotky zákazníka (požadavek 9.3).

Účel:
  Jednotky jsou v hlavičce CSV (`OF_OperatingForce [mN]`). Od 10/2026 Analyzing zapisuje do PLC
  jednotky zákazníka a DatabaseGateway je tak označuje; starší soubory mají N, Ω a A. ScadaViewer
  proto čte jednotku z hlavičky a vše převádí na jednotky zákazníka — zobrazení, XLSX i grafy
  jsou stejné bez ohledu na stáří souboru (audit X1).

Zodpovědnost:
  - unit_factor() / canonical_header() — násobek a hlavička v jednotkách zákazníka
  - scale_text() — převod textové hodnoty z CSV (prázdná / nečíselná zůstane beze změny)
  - position_scale() — souřadnice poloh v souboru: zákazník (P = C − x, při stlačení klesá)
    nebo enkodér (x, starší soubory)

Jednotky zákazníka:
  síla mN · dráha a poloha µm · odpor mΩ (> 999,9 = rozepnuto / ∞) · čas µs · proud mA
"""
from __future__ import annotations

import math

# zdrojová jednotka (lowercase) → (jednotka zákazníka, násobek)
_TO_CUSTOMER: dict[str, tuple[str, float]] = {
    "n":   ("mN",   1000.0),
    "ohm": ("mOhm", 1000.0),
    "a":   ("mA",   1000.0),
}

#: Sloupce, jejichž jednotka v hlavičce starších souborů neodpovídá hodnotám → skutečná jednotka
#: (hodnota se nepřevádí). DatabaseGateway psal Electric_Current „[A]" a Measuring_BasePeriod
#: „[ms]", PLC ale posílá mA a µs (opraveno v Gateway 2026-09-28 / 2026-10-09).
_HEADER_UNIT_TRUE: dict[str, str] = {"electric_current": "mA", "measuring_baseperiod": "us"}

#: Odpor nad touto hodnotou [mΩ] = rozepnutý kontakt („∞"). Shodně s Analyzing
#: (writer.R_INFINITE_ABOVE_MOHM); Analyzing pak zapisuje 9999,9, starší soubory 1 000 000 Ω.
OPEN_CONTACT_MOHM = 999.9


def split_unit(header: str) -> tuple[str, str | None]:
    """'OF_OperatingForce [N]' → ('OF_OperatingForce', 'N'); bez jednotky → (název, None)."""
    lb = header.find("[")
    if lb < 0:
        return header.strip(), None
    rb = header.find("]", lb)
    unit = header[lb + 1: rb if rb > lb else len(header)].strip()
    return header[:lb].strip(), unit


def unit_factor(header: str) -> float:
    """Násobek pro převod hodnoty sloupce na jednotku zákazníka (1.0 = beze změny)."""
    name, unit = split_unit(header)
    if unit is None or name.lower() in _HEADER_UNIT_TRUE:
        return 1.0
    hit = _TO_CUSTOMER.get(unit.lower())
    return hit[1] if hit else 1.0


def canonical_header(header: str) -> str:
    """Hlavička s jednotkou zákazníka: 'R_NC… [Ohm]' → 'R_NC… [mOhm]'."""
    name, unit = split_unit(header)
    if unit is None:
        return header
    if name.lower() in _HEADER_UNIT_TRUE:
        return f"{name} [{_HEADER_UNIT_TRUE[name.lower()]}]"
    hit = _TO_CUSTOMER.get(unit.lower())
    return f"{name} [{hit[0]}]" if hit else header


def _fmt(x: float) -> str:
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def scale_text(value: str | None, factor: float) -> str | None:
    """Textová hodnota × factor. Prázdná, nečíselná nebo nekonečná zůstane beze změny."""
    if factor == 1.0 or not value:
        return value
    try:
        x = float(value)
    except ValueError:
        return value
    if not math.isfinite(x):
        return value
    return _fmt(x * factor)


#: Rozepnutý kontakt v exportu — jednotně jako Analyzing / PLC (starší soubory mají 1 000 000 Ω = 10⁹ mΩ)
OPEN_CONTACT_EXPORT = "9999.9"
_POSITION_NAMES = frozenset({"fp_freeposition", "op_operatingposition", "rp_realeasingposition",
                             "ttp_totaltravelposition", "fpr_freepositionreturn"})


def export_value(header: str, value: str | None) -> str:
    """Hodnota sloupce pro export (XLSX) v jednotkách zákazníka; odpor nad 999,9 mΩ → 9999.9."""
    out = scale_text(value, unit_factor(header)) or ""
    name, unit = split_unit(header)
    if unit and unit.lower() in ("ohm", "mohm") and name.lower().startswith("r_"):
        try:
            if round(float(out), 1) > OPEN_CONTACT_MOHM:
                return OPEN_CONTACT_EXPORT
        except ValueError:
            pass
    return out


def export_header(header: str, scale: str | None) -> str:
    """Hlavička pro export v jednotkách zákazníka; polohy na stupnici enkodéru označené."""
    canon = canonical_header(header)
    name, unit = split_unit(canon)
    if scale == "encoder" and name.lower() in _POSITION_NAMES and unit:
        return f"{name} [{unit}, encoder]"
    return canon


def position_scale(fp: str | float | None, ttp: str | float | None) -> str | None:
    """Souřadnice poloh podle FP a TTP: 'customer' (FP > TTP — při stlačení klesá),
    'encoder' (FP < TTP — starší soubory, x od klidové polohy vozíku), None = nelze určit."""
    try:
        f, t = float(fp), float(ttp)              # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(f) and math.isfinite(t)) or f == t:
        return None
    return "customer" if f > t else "encoder"
