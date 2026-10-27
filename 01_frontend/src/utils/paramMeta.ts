/**
 * @file paramMeta.ts
 * @description Sdílená metadata měřených parametrů — zkratky, anglické popisy, jednotky
 *   a JEDINÉ místo pro formátování hodnot (formatParam). Používají ho všechny pohledy:
 *   rozbalený řádek v Database (FileTable), detail zakázky (ChartView) i detail záznamu
 *   (RecordDiagram) — stejná hodnota se tak všude zobrazí stejně.
 *
 *   Jednotky zákazníka (požadavek 9.3) — backend je už převedl podle hlavičky CSV
 *   (services/units.py; starší soubory N / Ω):
 *     Síly mN (celá čísla) · polohy a dráhy µm (0,1) · časy µs (celá čísla) · odpory mΩ (0,1)
 *     Odpor nad 999,9 mΩ = rozepnutý kontakt „∞" (Analyzing zapisuje 9999,9, starší soubory 10⁹).
 *   Polohy FP/OP/RP/TTP: souřadnice zákazníka P = výška hmatníku nad osou upevňovacích otvorů
 *   (při stlačení klesá); starší soubory stupnice enkodéru (při stlačení roste) — /api/data
 *   to hlásí v position_scale. Dráhy jsou v obou případech kladné vzdálenosti.
 *   XLSX ze serveru má stejné jednotky; originální CSV zůstává beze změny.
 */

/** Zkratka pro záhlaví sloupce — pro klíče bez záznamu se zobrazí surový klíč. */
export const PARAM_LABELS: Record<string, string> = {
  timestamp:        'Timestamp',
  microswitch_id:   'ID',
  microswitch_name: 'Switch',
  sortingcategory:  'KAT.',
  status:           'Status',
  // Forces
  of_operatingforce:           'OF',
  rf_realisingforce:           'RF',
  ttf_totaltravelforce:        'TTF',
  df_differentialforce:        'DF',
  // Distances
  pt_pretravel:                'PT',
  ot_overtravel:               'OvT',
  rt_realisingtravel:          'RvT',
  md_movementdifferential:     'MD',
  tt_totaltravel:              'TT',
  fp_freeposition:             'FP',
  op_operatingposition:        'OP',
  rp_realeasingposition:       'RP',
  ttp_totaltravelposition:     'TTP',
  fpr_freepositionreturn:      'FPR',
  // Times
  ut_unstabletime:             'UT',
  rt_reversetime:              'RevT',
  bt_bouncetime:               'BT',
  ot_operatingtime:            'OpT',
  // Contacts
  r_nc_operatingposition_neg:  'R NCo−',
  r_nc_operatingposition_pos:  'R NCo+',
  r_nc_releasingposition_neg:  'R NCr−',
  r_nc_releasingposition_pos:  'R NCr+',
  r_no_operatingposition_neg:  'R NOo−',
  r_no_operatingposition_pos:  'R NOo+',
  r_no_releasingposition_neg:  'R NOr−',
  r_no_releasingposition_pos:  'R NOr+',
  r_nc_static:                 'R NC stat',
  r_no_static:                 'R NO stat',
  // NOK diagnostics
  nokreason:                   'NOK',
  nokcategory_force:           'NOK F',
  nokcategory_position:        'NOK P',
  nokcategory_electric:        'NOK E',
  nokcategory_times:           'NOK T',
  nokcategory_process:         'NOK Pr',
  // Testing input parameters
  drive_distance:              'Dist',
  drive_velocity:              'Vel',
  drive_acceleration:          'Acc',
  drive_deceleration:          'Dec',
  drive_jerk:                  'Jerk',
  electric_current:            'I',
  electric_voltage:            'U',
  measuring_baseperiod:        'BasePer',
  measuring_oversampling:      'OvSmpl',
  measuring_samplesreserve:    'SmplRes',
  limits_distancemax:          'DistMax',
  limits_forcemax:             'FMax',
  // Measured info
  measuretime:                 'MeasT',
  meas_ts:                     'MeasTS',
  positionreference:           'C',
}

/**
 * Skupiny parametrů — sdíleno mezi ChartView (záložky tabulky) a RecordDiagram (ParamTable).
 * Každá skupina má id, label, barvu a seznam klíčů CSV záznamu.
 */
/**
 * `id`    — klíč pro tab state v ChartView
 * `label` — zkrácený název (ChartView záložky)
 * `unit`  — jednotka zobrazená v RecordDiagram záhlaví skupiny
 * `color` — barva skupiny (RecordDiagram group header, SVG kóty)
 * `keys`  — CSV klíče v této skupině
 */
export const PARAM_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'forces',    label: 'Forces',    unit: 'mN',  color: '#d97706',
    keys: ['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce', 'df_differentialforce'] },
  { id: 'positions', label: 'Positions', unit: 'µm',  color: '#2563eb',
    keys: ['fp_freeposition', 'op_operatingposition', 'rp_realeasingposition', 'ttp_totaltravelposition',
      'fpr_freepositionreturn'] },
  { id: 'travel',    label: 'Travel',    unit: 'µm',  color: '#0891b2',
    keys: ['pt_pretravel', 'ot_overtravel', 'rt_realisingtravel', 'md_movementdifferential', 'tt_totaltravel'] },
  { id: 'times',     label: 'Times',     unit: 'µs',  color: '#059669',
    keys: ['ut_unstabletime', 'rt_reversetime', 'bt_bouncetime', 'ot_operatingtime'] },
  { id: 'electric',  label: 'Electric',  unit: 'mΩ', color: '#7c3aed',
    keys: [
      'r_nc_operatingposition_neg', 'r_nc_operatingposition_pos',
      'r_nc_releasingposition_neg', 'r_nc_releasingposition_pos',
      'r_no_operatingposition_neg', 'r_no_operatingposition_pos',
      'r_no_releasingposition_neg', 'r_no_releasingposition_pos',
      'r_nc_static', 'r_no_static',                      // statický odpor (Analyzing, od 2026-10-22)
    ] },
]

/** Parametry přidané v Analyzing 2.4.0 / DatabaseGateway (2026-10-21) — starší soubory sloupec
 *  nemají vůbec → tabulky parametrů je u nich vynechají (ne řádek „—"). */
export const NEWER_PARAM_KEYS: ReadonlySet<string> = new Set(['df_differentialforce', 'fpr_freepositionreturn',
  'r_nc_static', 'r_no_static'])   // statické odpory od 2026-10-22

/** Skupiny vstupních parametrů pro Testing detail (TestingParameters + MeasuredInfo). */
export const TESTING_INPUT_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'drive',     label: 'Drive',     unit: '',  color: '#0ea5e9',
    keys: ['drive_distance', 'drive_velocity', 'drive_acceleration', 'drive_deceleration', 'drive_jerk'] },
  { id: 'elec_in',   label: 'Electric',  unit: '',  color: '#8b5cf6',
    keys: ['electric_current', 'electric_voltage'] },
  { id: 'measuring', label: 'Measuring', unit: '',  color: '#14b8a6',
    keys: ['measuring_baseperiod', 'measuring_oversampling', 'measuring_samplesreserve'] },
  { id: 'limits',    label: 'Limits',    unit: '',  color: '#f59e0b',
    keys: ['limits_distancemax', 'limits_forcemax'] },
]

/** Metadata sekce — klíče z [Metadata] bloku CSV (TEST od 2026-10-16 jako PROD_: Timestamp;Recipe;
 *  Microswitch_ID (SAP číslo, STRING);Microswitch_Name — starší TEST soubory bez Recipe, ID číslo). */
export const METADATA_KEYS = ['timestamp', 'recipe', 'microswitch_id', 'microswitch_name']

/** Maska NokCategory[1..5] — Force, Position, Electric, Times, Process ('1' = selhalo). */
export const NOKCATEGORY_KEYS = ['nokcategory_force', 'nokcategory_position',
  'nokcategory_electric', 'nokcategory_times', 'nokcategory_process']

/** NokInfo sekce — klíče z [NokInfo] bloku CSV: maska NokCategory (Gateway od 2026-10-16 jen ta),
 *  `nokreason` (starší soubory), `status` (jen pojistka — Gateway ho u testu nezapisuje). */
export const NOKINFO_KEYS = ['status', 'nokreason', ...NOKCATEGORY_KEYS]

/** OK / NOK kusu zakázky (production) — STEJNÉ pravidlo jako backend `_record_matches`
 *  (filtr stavu na serveru), audit Q10: kategorie 1–6 (`group` u starších souborů, jinak
 *  `sortingcategory`) — 1–4 OK, 5–6 NOK; bez platné kategorie sloupec Status (2 OK, 5 / 6 NOK).
 *  null = neznámé. */
export function recordOkState(rec: Record<string, unknown>): 'ok' | 'nok' | null {
  const grp = String(rec.group ?? '').trim() || String(rec.sortingcategory ?? '').trim()
  const cat = Number(grp)
  if (Number.isInteger(cat) && cat >= 1 && cat <= 6) return cat <= 4 ? 'ok' : 'nok'
  const st = String(rec.status ?? '').trim()
  if (st === '2') return 'ok'
  if (st === '5' || st === '6') return 'nok'
  return null
}

/** Výsledek testu z bloku [NokInfo] (audit Q1). Gateway zapisuje jen masku NokCategory[1..5]
 *  (Status u testu se nepoužívá — rozhodnutí 2026-10-16; NokReason zrušen 2026-10-15):
 *  1. kdyby soubor nesl `Status` (2 = OK, 5 / 6 = NOK), rozhoduje — pojistka pro budoucí formát;
 *  2. jinak NOK = některá NokCategory_* = 1, u starších souborů i NokReason ≠ 0.
 *  `hasInfo` = soubor blok [NokInfo] má; `reason` = kód NokReason (jen starší soubory). */
export function testingNokState(rec: Record<string, unknown>): {
  hasInfo: boolean; isNok: boolean; reason: number | null
} {
  const hasInfo = NOKINFO_KEYS.some(k => rec[k] != null && rec[k] !== '')
  const raw = rec.nokreason
  const reason = raw != null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null
  const st = String(rec.status ?? '').trim()
  if (st === '2') return { hasInfo, isNok: false, reason }
  if (st === '5' || st === '6') return { hasInfo, isNok: true, reason }
  const anyCat = NOKCATEGORY_KEYS.some(k => String(rec[k] ?? '0').trim() === '1')
  return { hasInfo, isNok: anyCat || (reason != null && reason !== 0), reason }
}

/** MeasuredInfo sekce — klíče z [MeasuredInfo] bloku CSV. */
export const MEASUREDINFO_KEYS = ['measuretime', 'meas_ts', 'positionreference']

/** MeasuredInfo jako skupina pro sdílenou ParamTable (Testing detail). */
export const MEASUREDINFO_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'measured', label: 'Measurement', unit: '', color: '#64748b', keys: MEASUREDINFO_KEYS },
]

/** Anglický popis zobrazený v tooltipu (klik/tap na záhlaví sloupce). */
export const PARAM_TOOLTIPS: Record<string, string> = {
  timestamp:        'Measurement Timestamp',
  microswitch_id:   'Microswitch ID',
  microswitch_name: 'Microswitch Type',
  sortingcategory:  'Sorting Category / box (1–4 OK · 5 NOK Trafag · 6 NOK Supplier)',
  status:           'Status (2 = OK · 5 = NOK)',
  // Forces
  of_operatingforce:           'Operating Force [mN]',
  rf_realisingforce:           'Releasing Force [mN]',
  ttf_totaltravelforce:        'Total Travel Force [mN]',
  df_differentialforce:        'Differential Force [mN] (OF − RF)',
  // Distances — dráha mezi body (platí v souřadnicích zákazníka i na stupnici enkodéru starších
  // souborů); vzorec se znaménkem v nápovědě PARAM_DESC
  pt_pretravel:                'Pre-travel [µm] (FP → OP)',
  ot_overtravel:               'Overtravel [µm] (OP → TTP)',
  rt_realisingtravel:          'Releasing Travel [µm] (FP → RP, Leerlaufweg; files before 27 Oct 2026: TTP → RP)',
  md_movementdifferential:     'Movement Differential [µm] (OP → RP)',
  tt_totaltravel:              'Total Travel [µm] (FP → TTP)',
  fp_freeposition:             'Free Position [µm]',
  op_operatingposition:        'Operating Position [µm]',
  rp_realeasingposition:       'Releasing Position [µm]',
  ttp_totaltravelposition:     'Total Travel Position [µm]',
  fpr_freepositionreturn:      'Free Position Return [µm]',
  // Times
  ut_unstabletime:             'Unstable Time [µs]',
  rt_reversetime:              'Reverse Time [µs]',
  bt_bouncetime:               'Bounce Time [µs]',
  ot_operatingtime:            'Operating Time [µs] (UT + RevT + BT)',
  // Contacts
  r_nc_operatingposition_neg:  'NC — Operating Position Neg [mΩ]',
  r_nc_operatingposition_pos:  'NC — Operating Position Pos [mΩ]',
  r_nc_releasingposition_neg:  'NC — Releasing Position Neg [mΩ]',
  r_nc_releasingposition_pos:  'NC — Releasing Position Pos [mΩ]',
  r_no_operatingposition_neg:  'NO — Operating Position Neg [mΩ]',
  r_no_operatingposition_pos:  'NO — Operating Position Pos [mΩ]',
  r_no_releasingposition_neg:  'NO — Releasing Position Neg [mΩ]',
  r_no_releasingposition_pos:  'NO — Releasing Position Pos [mΩ]',
  r_nc_static:                 'NC — Static Resistance (closed, outside switching) [mΩ]',
  r_no_static:                 'NO — Static Resistance (closed, outside switching) [mΩ]',
  // NOK diagnostics
  nokreason:                   'NOK Reason Code',
  nokcategory_force:           'NOK Category — Force',
  nokcategory_position:        'NOK Category — Position',
  nokcategory_electric:        'NOK Category — Electric',
  nokcategory_times:           'NOK Category — Times',
  nokcategory_process:         'NOK Category — Process',
  // Testing input parameters
  drive_distance:              'Drive Distance [mm]',
  drive_velocity:              'Drive Velocity [mm/s]',
  drive_acceleration:          'Drive Acceleration [mm/s²]',
  drive_deceleration:          'Drive Deceleration [mm/s²]',
  drive_jerk:                  'Drive Jerk [mm/s³]',
  electric_current:            'Electric Current [mA]',
  electric_voltage:            'Electric Voltage [V]',
  measuring_baseperiod:        'Measuring Base Period [µs]',
  measuring_oversampling:      'Measuring Oversampling [−]',
  measuring_samplesreserve:    'Measuring Samples Reserve [−]',
  limits_distancemax:          'Distance Limit Max [mm]',
  limits_forcemax:             'Force Limit Max [mN]',
  // Measured info
  measuretime:                 'Measurement Duration [s]',
  meas_ts:                     'Measurement Timestamp — PLC clock [unix s]',
  positionreference:           'Position Reference C [µm] (P = C − x)',
}

// ── Formátování hodnot — jediný zdroj pro všechny pohledy ────────────────────

/** Odpor nad touto hodnotou [mΩ] = rozepnutý kontakt („∞") — zákazník 9.3, Analyzing zapisuje 9999,9. */
export const OPEN_CONTACT_THRESHOLD = 999.9

/** Počet desetinných míst podle skupiny (rozlišení zákazníka 9.3: 1 mN, 0,1 µm, 1 µs, 0,1 mΩ). */
const GROUP_DECIMALS: Record<string, number> = {
  forces: 0, positions: 1, travel: 1, times: 0, electric: 1,
}

/** Klíč parametru → id skupiny (forces / positions / travel / times / electric). */
const KEY_GROUP: Record<string, string> = Object.fromEntries(
  PARAM_GROUPS.flatMap(g => g.keys.map(k => [k, g.id])),
)

/**
 * Vstupní parametry testu (Testing) — jednotka a desetinná místa.
 * Jednotky dle hlavičky CSV z DatabaseGateway po převodu na jednotky zákazníka (backend units.py).
 */
const EXTRA_FORMAT: Record<string, { unit: string; decimals: number }> = {
  drive_distance:           { unit: 'mm',    decimals: 3 },
  drive_velocity:           { unit: 'mm/s',  decimals: 3 },
  drive_acceleration:       { unit: 'mm/s²', decimals: 1 },
  drive_deceleration:       { unit: 'mm/s²', decimals: 1 },
  drive_jerk:               { unit: 'mm/s³', decimals: 1 },
  electric_current:         { unit: 'mA',    decimals: 1 },   // hodnota v mA (starší CSV mají v hlavičce chybně [A])
  electric_voltage:         { unit: 'V',     decimals: 1 },
  measuring_baseperiod:     { unit: 'µs',    decimals: 0 },   // perioda PLC cyklu v µs (starší CSV mají v hlavičce chybně [ms])
  measuring_oversampling:   { unit: '',      decimals: 0 },
  measuring_samplesreserve: { unit: '',      decimals: 1 },   // koeficient (např. 1,1 = +10 %)
  limits_distancemax:       { unit: 'mm',    decimals: 3 },
  limits_forcemax:          { unit: 'mN',    decimals: 0 },   // backend převádí [N] → mN
  measuretime:              { unit: 's',     decimals: 1 },
  positionreference:        { unit: 'µm',    decimals: 1 },   // konstanta C (Gateway od 2026-10-21)
}

/** Zobrazovací jednotka parametru ('' pro ne-parametry). */
export function paramUnit(key: string): string {
  const group = PARAM_GROUPS.find(g => g.id === KEY_GROUP[key])
  return group?.unit ?? EXTRA_FORMAT[key]?.unit ?? ''
}

export interface FormattedParam {
  /** Text k zobrazení ('—' = chybí, '∞' = rozepnutý kontakt) */
  text: string
  /** true = rozepnutý kontakt — zobrazit s popiskem t.chart.openContact */
  open: boolean
}

/** Číslo na daný počet des. míst bez „−0" (záporná nula po zaokrouhlení). */
function toFixedNoNegZero(n: number, decimals: number): string {
  const text = n.toFixed(decimals)
  return Number(text) === 0 ? (0).toFixed(decimals) : text
}

/** Skupiny, kde 0 = hodnota nestanovena (Analyzing W5/W6), ne naměřená nula. Dráhy a časy 0 mít mohou. */
const UNDETERMINED_IF_ZERO = new Set(['positions', 'forces', 'electric'])

/** true = klíč je odpor kontaktu (skupina electric). */
function isResistance(key: string): boolean {
  return KEY_GROUP[key] === 'electric'
}

/**
 * Naformátuje hodnotu parametru pro zobrazení. Ne-parametry (timestamp, status…) vrací beze změny.
 * Hodnoty jsou už v jednotkách zákazníka (převod podle hlavičky CSV dělá backend).
 */
export function formatParam(key: string, raw: unknown): FormattedParam {
  if (raw == null || String(raw).trim() === '') return { text: '—', open: false }
  const group = KEY_GROUP[key]
  const n = Number(raw)
  if (key === 'meas_ts' && !isNaN(n) && n > 0) {
    // unixový čas [s] → datum a čas (cs-CZ). TwinCAT ho posílá v MÍSTNÍM čase PLC uloženém jako unix
    // (ověřeno: Meas_TS = [Metadata] Timestamp) → formátovat jako UTC, jinak +1–2 h (A26-34)
    return { text: new Date(n * 1000).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC',
    }), open: false }
  }
  const extra = EXTRA_FORMAT[key]
  if (extra && !isNaN(n)) return { text: toFixedNoNegZero(n, extra.decimals), open: false }
  if (group && /^[+-]?inf/i.test(String(raw).trim())) {            // „inf" z CSV
    return isResistance(key) ? { text: '∞', open: true } : { text: '—', open: false }
  }
  if (group && isNaN(n)) return { text: '—', open: false }          // „nan" a jiný text u parametru
  if (!group) return { text: String(raw), open: false }
  // ∞ podle hodnoty zaokrouhlené na rozlišení 0,1 mΩ (999,90002 z float32 = 999,9, ne ∞)
  if (isResistance(key) && Math.round(n * 10) / 10 > OPEN_CONTACT_THRESHOLD) return { text: '∞', open: true }
  // 0 u polohy, síly nebo odporu fyzikálně nenastane — Analyzing ji zapisuje, když hodnotu
  // nestanovil (varování W5 = bez dotyku, W6 = bez přepnutí). Zobrazit jako chybějící, ne „0".
  if (n === 0 && UNDETERMINED_IF_ZERO.has(group)) return { text: '—', open: false }
  return { text: toFixedNoNegZero(n, GROUP_DECIMALS[group] ?? 2), open: false }
}

/** Jednotka z hlavičky CSV → zobrazovací (um → µm, mOhm → mΩ, us → µs, mm/s2 → mm/s²). */
export function displayUnit(unit: string): string {
  return unit
    .replace(/^um$/i, 'µm').replace(/^us$/i, 'µs').replace(/mOhm/i, 'mΩ').replace(/Ohm/i, 'Ω')
    .replace(/s2$/, 's²').replace(/s3$/, 's³')
}

/** Klíč parametru podle zkratky (MD → md_movementdifferential) — pro formátování mezí kategorií. */
export function paramKeyForLabel(label: string | null | undefined): string {
  if (!label) return ''
  return Object.keys(PARAM_LABELS).find(k => PARAM_LABELS[k] === label) ?? ''
}

/**
 * Limit třídění / mez kategorie — číslo na rozlišení skupiny parametru (mN celá, µm 0,1, µs celá,
 * mΩ 0,1), ale BEZ pravidel naměřených hodnot: 1 000 000 mΩ je limit, ne rozepnutý kontakt (∞),
 * a 0 je platná mez (ne „nestanoveno"). Prázdné = '—'; neznámý klíč = text beze změny.
 */
export function formatLimit(key: string, raw: string | null | undefined): string {
  if (raw == null || raw.trim() === '') return '—'
  const n = Number(raw)
  const group = KEY_GROUP[key]
  if (!group || isNaN(n)) return raw
  return toFixedNoNegZero(n, GROUP_DECIMALS[group] ?? 2)
}

/** true pokud má parametr aspoň v jednom záznamu měřenou hodnotu (ne prázdnou, ne ∞). */
export function hasMeasuredValue(key: string, records: Record<string, unknown>[]): boolean {
  return records.some(r => {
    const v = r[key]
    if (v == null || String(v).trim() === '') return false
    const n = Number(v)
    return isNaN(n) || !isResistance(key) || Math.round(n * 10) / 10 <= OPEN_CONTACT_THRESHOLD
  })
}

/**
 * Souřadnice poloh v záznamech: 'customer' = výška nad osou upevňovacích otvorů (FP > TTP,
 * při stlačení klesá), 'encoder' = stupnice enkodéru (starší soubory, FP < TTP), null = nelze určit.
 * Stejné pravidlo jako backend (services/units.position_scale).
 */
export function positionScaleOf(records: Record<string, unknown>[]): 'customer' | 'encoder' | null {
  for (const r of records) {
    // prázdná hodnota (NaN z analýzy → Gateway zapíše prázdné pole) není 0
    if (String(r.fp_freeposition ?? '').trim() === '' || String(r.ttp_totaltravelposition ?? '').trim() === '') continue
    const fp = Number(r.fp_freeposition)
    const ttp = Number(r.ttp_totaltravelposition)
    if (!isFinite(fp) || !isFinite(ttp) || fp === ttp) continue
    return fp > ttp ? 'customer' : 'encoder'
  }
  return null
}

/**
 * Definice RT_RealisingTravel v záznamu. Od 27. 10. 2026 (Analyzing 2.6.3) = Releasing travel / Leerlaufweg
 * podle DIN 41636-1: dráha FP → RP (RT = FP − RP = PT − MD), dřív dráha od konce zdvihu zpět k RP (TTP → RP,
 * Rücklaufweg). Rozpozná se z vlastních poloh kusu — sloupec i datum souboru jsou stejné; která dráha hodnotu
 * RT přesněji vysvětluje (na 0,1 µm), ta platí. Nelze určit (chybí polohy, neurčené RT) → nová definice.
 */
export type RtDefinition = 'fp_rp' | 'ttp_rp'

export function rtDefinition(record: Record<string, unknown>): RtDefinition {
  const num = (k: string): number | null => {
    const v = record[k]
    if (v == null || String(v).trim() === '') return null
    const n = Number(v)
    return isFinite(n) && n !== 0 ? n : null      // 0 = nestanoveno (W5 / W6)
  }
  const rt = num('rt_realisingtravel'), fp = num('fp_freeposition')
  const rp = num('rp_realeasingposition'), ttp = num('ttp_totaltravelposition')
  if (rt === null || rp === null) return 'fp_rp'
  const dNew = fp !== null ? Math.abs(Math.abs(rt) - Math.abs(rp - fp)) : Infinity
  const dOld = ttp !== null ? Math.abs(Math.abs(rt) - Math.abs(ttp - rp)) : Infinity
  return dOld < dNew ? 'ttp_rp' : 'fp_rp'
}

/** Všechny měřené parametry v pořadí skupin (Forces, Positions, Travel, Times, Electric). */
export const ALL_PARAM_KEYS: string[] = PARAM_GROUPS.flatMap(g => g.keys)

// ── České popisy parametrů ──────────────────────────────────────────────────

/** Český popis parametru (nápověda „?" v tabulkách parametrů) — význam, výpočet, jednotka.
 *  Anglická verze: PARAM_DESC_EN; výběr podle jazyka přes paramDesc(key, lang). */
export const PARAM_DESC: Record<string, string> = {
  of_operatingforce:
    'Síla [mN] v bodě sepnutí (OP). Pokud je příliš velká nebo malá, spínač neodpovídá specifikaci.',
  rf_realisingforce:
    'Síla [mN] při uvolnění kontaktu na zpáteční cestě (RP). Spolu s OF definuje silovou hysterezi.',
  ttf_totaltravelforce:
    'Maximální síla [mN] na konci zdvihu (TTP). Nesmí překročit povolenou mez pro daný typ.',
  df_differentialforce:
    'Silový diferenciál [mN] — rozdíl síly sepnutí a síly uvolnění (DF = OF − RF), silová hystereze spínače. Starší soubory tento parametr nemají.',
  fp_freeposition:
    'Klidová poloha hmatníku [µm] bez vnější síly — výška nad osou upevňovacích otvorů (jako kóty výkresu; při stlačení klesá). Starší soubory: dráha vozíku od klidové polohy.',
  op_operatingposition:
    'Poloha [µm] bodu sepnutí kontaktu na dopředné cestě — výška nad osou upevňovacích otvorů. PT = FP − OP. Starší soubory: stupnice enkodéru (při stlačení roste).',
  rp_realeasingposition:
    'Poloha [µm] bodu uvolnění kontaktu na zpáteční cestě — výška nad osou upevňovacích otvorů. MD = RP − OP. Starší soubory: stupnice enkodéru (při stlačení roste).',
  ttp_totaltravelposition:
    'Poloha [µm] konce zdvihu — nejhlubší bod stlačení při měření (výška nad osou upevňovacích otvorů). TT = FP − TTP. Starší soubory: stupnice enkodéru (při stlačení roste).',
  fpr_freepositionreturn:
    'Volná poloha po návratu [µm] — kde při zpětném chodu síla trvale klesne zpět na nulu (zrcadlo FP, výška nad osou upevňovacích otvorů). U dobrého kusu leží blízko FP. Starší soubory tento parametr nemají.',
  pt_pretravel:
    'Předzdvih [µm] — dráha od FP do OP (PT = FP − OP). Musí být dostatečná pro spolehlivé sepnutí.',
  ot_overtravel:
    'Přezdvih [µm] — rezerva za bodem sepnutí (OT = OP − TTP). Chrání kontakt před přetížením.',
  rt_realisingtravel:
    'Uvolňovací zdvih (Leerlaufweg, DIN 41636-1) [µm] — dráha od klidové polohy FP do bodu uvolnění RP (RT = FP − RP = PT − MD); nezávisí na hloubce stlačení. Soubory do 27. 10. 2026: dráha od konce zdvihu zpět do RP (TTP → RP) — diagram kusu vyznačí, která dráha platí.',
  md_movementdifferential:
    'Diferenciál pohybu [µm] — vzdálenost mezi OP a RP (MD = RP − OP, polohová hystereze). Větší MD = stabilnější přepínání. Záporné MD = záporná hystereze (RP leží za OP) — spínač neodpovídá běžnému chování.',
  tt_totaltravel:
    'Celkový zdvih [µm] — dráha od FP do TTP (TT = FP − TTP).',
  ut_unstabletime:
    'Nestabilní čas [µs] — délka kmitů kontaktu těsně po sepnutí, než se kontakt definitivně otevře.',
  rt_reversetime:
    'Čas reverzu [µs] — okno, ve kterém kontakt dočasně reverzuje zpět k zavřenému stavu (NC se krátce uzavře).',
  bt_bouncetime:
    'Čas odskoku [µs] — celková délka zákmitů po sepnutí. Delší BT = více šumu, pomalejší odezva.',
  ot_operatingtime:
    'Čas sepnutí [µs] — celková doba spínání, součet UT + RevT + BT.',
  r_nc_operatingposition_neg:
    'Odpor [mΩ] kontaktu NC těsně před přepnutím v bodě OP (medián v okně 3 µm dráhy) — NC je ještě sepnutý, očekává se nízká hodnota (jednotky mΩ). Vysoký odpor = opotřebení nebo znečištění kontaktu.',
  r_nc_operatingposition_pos:
    'Odpor [mΩ] kontaktu NC těsně po přepnutí v bodě OP — NC je už rozepnutý, očekává se ∞ (nad 999,9 mΩ).',
  r_nc_releasingposition_neg:
    'Odpor [mΩ] kontaktu NC těsně před přepnutím v bodě RP (zpětný chod) — NC je ještě rozepnutý, očekává se ∞ (nad 999,9 mΩ).',
  r_nc_releasingposition_pos:
    'Odpor [mΩ] kontaktu NC těsně po přepnutí v bodě RP — NC je znovu sepnutý, očekává se nízká hodnota (jednotky mΩ).',
  r_no_operatingposition_neg:
    'Odpor [mΩ] kontaktu NO těsně před přepnutím v bodě OP — NO je ještě rozepnutý, očekává se ∞ (nad 999,9 mΩ).',
  r_no_operatingposition_pos:
    'Odpor [mΩ] kontaktu NO těsně po přepnutí v bodě OP (medián v okně 3 µm dráhy) — NO je sepnutý, očekává se nízká hodnota (jednotky mΩ). Vysoký odpor = špatně sepnutý kontakt.',
  r_no_releasingposition_neg:
    'Odpor [mΩ] kontaktu NO těsně před přepnutím v bodě RP (zpětný chod) — NO je ještě sepnutý, očekává se nízká hodnota (jednotky mΩ).',
  r_no_releasingposition_pos:
    'Odpor [mΩ] kontaktu NO těsně po přepnutí v bodě RP — NO je rozepnutý, očekává se ∞ (nad 999,9 mΩ).',
  r_nc_static:
    'Statický odpor [mΩ] sepnutého kontaktu NC — největší odpor ve vodivém stavu mimo přepnutí (od začátku měření do 50 µm před OP a od 50 µm za RP do konce, bez izolovaných špiček). Zákazník: ≤ 600 mΩ. Vysoká hodnota = opotřebený / znečištěný kontakt nebo vadné kontaktování měření. Starší soubory tento parametr nemají.',
  r_no_static:
    'Statický odpor [mΩ] sepnutého kontaktu NO — největší odpor ve vodivém stavu mimo přepnutí (od 50 µm za sepnutím do 50 µm před rozepnutím). Zákazník: ≤ 600 mΩ. Vysoká hodnota = špatně sepnutý kontakt nebo vadné kontaktování měření. Starší soubory tento parametr nemají.',
  // ── Vstupní parametry testu (Testing — [TestingParameters], [MeasuredInfo]) ──
  drive_distance:
    'Dráha pohonu [mm] — jak daleko pohon při testu mikrospínač stlačí (délka zdvihu).',
  drive_velocity:
    'Rychlost pohonu [mm/s] během měření. Ovlivňuje rozlišení polohy mezi vzorky.',
  drive_acceleration:
    'Zrychlení pohonu [mm/s²] při rozjezdu.',
  drive_deceleration:
    'Zpomalení pohonu [mm/s²] při brzdění na konci zdvihu.',
  drive_jerk:
    'Ryv pohonu [mm/s³] — změna zrychlení; nižší hodnota = plynulejší rozjezd a dojezd.',
  electric_current:
    'Měřicí proud kontaktem nastavený pro test [mA] (starší soubory mají v hlavičce CSV chybně [A]).',
  electric_voltage:
    'Napětí měřicího obvodu kontaktů [V].',
  measuring_baseperiod:
    'Základní perioda vzorkování měření — perioda PLC cyklu [µs].',
  measuring_oversampling:
    'Převzorkování — kolik vzorků se pořizuje na jednu základní periodu.',
  measuring_samplesreserve:
    'Rezerva počtu vzorků — koeficient velikosti záznamu (např. 1,1 = o 10 % více vzorků než nominální doba měření).',
  limits_distancemax:
    'Maximální povolená dráha [mm] — při překročení se měření přeruší (ochrana mikrospínače).',
  limits_forcemax:
    'Maximální povolená síla [mN] — při překročení se měření přeruší (ochrana mikrospínače i snímače).',
  measuretime:
    'Celková doba měření [s] — délka záznamu signálu (dopředný i zpětný chod).',
  meas_ts:
    'Čas měření podle hodin PLC (unixový čas) — zobrazen jako datum a čas. Hodiny PLC zatím nejsou synchronizované, čas se může lišit o hodiny až dny; spolehlivý čas testu je v záhlaví (čas uložení z PC).',
  positionreference:
    'Kalibrační konstanta C [µm] z PLC — polohy zákazníka se počítají jako P = C − x (x = dráha pohonu). Závisí na startovní poloze pohonu a hrotu. Starší soubory ji nemají (C se pak dopočítá z TTP).',
}

/** Anglický popis parametru — stejné klíče jako PARAM_DESC (nápověda „?" v režimu EN). */
export const PARAM_DESC_EN: Record<string, string> = {
  of_operatingforce:
    'Force [mN] at the operating point (OP). If it is too high or too low, the switch does not meet the specification.',
  rf_realisingforce:
    'Force [mN] at which the contact releases on the return stroke (RP). Together with OF it defines the force hysteresis.',
  ttf_totaltravelforce:
    'Maximum force [mN] at the end of travel (TTP). Must not exceed the permitted limit for the switch type.',
  df_differentialforce:
    'Differential force [mN] — difference between the operating and the releasing force (DF = OF − RF), the force hysteresis of the switch. Older files do not contain this parameter.',
  fp_freeposition:
    'Rest position of the actuator [µm] without external force — height above the mounting-hole axis (as in the drawing; decreases when actuated). Older files: carriage travel from its rest position.',
  op_operatingposition:
    'Position [µm] where the contact switches on the forward stroke — height above the mounting-hole axis. PT = FP − OP. Older files: encoder scale (increases when actuated).',
  rp_realeasingposition:
    'Position [µm] where the contact releases on the return stroke — height above the mounting-hole axis. MD = RP − OP. Older files: encoder scale (increases when actuated).',
  ttp_totaltravelposition:
    'Position [µm] at the end of travel — the deepest point of actuation (height above the mounting-hole axis). TT = FP − TTP. Older files: encoder scale (increases when actuated).',
  fpr_freepositionreturn:
    'Free position return [µm] — where the force drops back to zero for good on the return stroke (mirror of FP, height above the mounting-hole axis). For a good piece it lies close to FP. Older files do not contain this parameter.',
  pt_pretravel:
    'Pre-travel [µm] — distance from FP to OP (PT = FP − OP). Must be sufficient for reliable switching.',
  ot_overtravel:
    'Overtravel [µm] — reserve beyond the operating point (OT = OP − TTP). Protects the contact from overload.',
  rt_realisingtravel:
    'Releasing travel (Leerlaufweg, DIN 41636-1) [µm] — distance from the free position FP to the releasing point RP (RT = FP − RP = PT − MD); independent of the actuation depth. Files before 27 Oct 2026: distance from the end of travel back to RP (TTP → RP) — the piece diagram shows which one applies.',
  md_movementdifferential:
    'Movement differential [µm] — distance between OP and RP (MD = RP − OP, position hysteresis). Larger MD = more stable switching. Negative MD = negative hysteresis (RP lies beyond OP) — abnormal switch behaviour.',
  tt_totaltravel:
    'Total travel [µm] — distance from FP to TTP (TT = FP − TTP).',
  ut_unstabletime:
    'Unstable time [µs] — duration of contact oscillation right after switching, before the contact settles.',
  rt_reversetime:
    'Reverse time [µs] — window in which the contact briefly reverses towards the closed state (NC closes for a moment).',
  bt_bouncetime:
    'Bounce time [µs] — total duration of contact bounce after switching. Longer BT = more noise, slower response.',
  ot_operatingtime:
    'Operating time [µs] — total switching time, the sum UT + RevT + BT.',
  r_nc_operatingposition_neg:
    'Resistance [mΩ] of the NC contact just before switching at OP (median over a 3 µm travel window) — NC is still closed, a low value is expected (a few mΩ). High resistance = worn or dirty contact.',
  r_nc_operatingposition_pos:
    'Resistance [mΩ] of the NC contact just after switching at OP — NC is already open, ∞ is expected (above 999.9 mΩ).',
  r_nc_releasingposition_neg:
    'Resistance [mΩ] of the NC contact just before switching at RP (return stroke) — NC is still open, ∞ is expected (above 999.9 mΩ).',
  r_nc_releasingposition_pos:
    'Resistance [mΩ] of the NC contact just after switching at RP — NC is closed again, a low value is expected (a few mΩ).',
  r_no_operatingposition_neg:
    'Resistance [mΩ] of the NO contact just before switching at OP — NO is still open, ∞ is expected (above 999.9 mΩ).',
  r_no_operatingposition_pos:
    'Resistance [mΩ] of the NO contact just after switching at OP (median over a 3 µm travel window) — NO is closed, a low value is expected (a few mΩ). High resistance = poorly closed contact.',
  r_no_releasingposition_neg:
    'Resistance [mΩ] of the NO contact just before switching at RP (return stroke) — NO is still closed, a low value is expected (a few mΩ).',
  r_no_releasingposition_pos:
    'Resistance [mΩ] of the NO contact just after switching at RP — NO is open, ∞ is expected (above 999.9 mΩ).',
  r_nc_static:
    'Static resistance [mΩ] of the closed NC contact — the highest resistance in the conducting state outside switching (from the start of the measurement to 50 µm before OP and from 50 µm after RP to the end, without isolated spikes). Customer: ≤ 600 mΩ. A high value = worn / dirty contact or faulty measurement contacting. Older files do not contain this parameter.',
  r_no_static:
    'Static resistance [mΩ] of the closed NO contact — the highest resistance in the conducting state outside switching (from 50 µm after closing to 50 µm before opening). Customer: ≤ 600 mΩ. A high value = poorly closed contact or faulty measurement contacting. Older files do not contain this parameter.',
  drive_distance:
    'Drive distance [mm] — how far the drive actuates the microswitch during the test (stroke length).',
  drive_velocity:
    'Drive velocity [mm/s] during the measurement. Affects the position resolution between samples.',
  drive_acceleration:
    'Drive acceleration [mm/s²] when starting.',
  drive_deceleration:
    'Drive deceleration [mm/s²] when braking at the end of the stroke.',
  drive_jerk:
    'Drive jerk [mm/s³] — rate of change of acceleration; a lower value = smoother start and stop.',
  electric_current:
    'Measuring current through the contact set for the test [mA] (older files incorrectly state [A] in the CSV header).',
  electric_voltage:
    'Voltage of the contact measuring circuit [V].',
  measuring_baseperiod:
    'Base sampling period of the measurement — PLC cycle period [µs].',
  measuring_oversampling:
    'Oversampling — how many samples are taken per base period.',
  measuring_samplesreserve:
    'Samples reserve — coefficient of the record size (e.g. 1.1 = 10 % more samples than the nominal measurement time).',
  limits_distancemax:
    'Maximum permitted distance [mm] — the measurement stops when exceeded (protects the microswitch).',
  limits_forcemax:
    'Maximum permitted force [mN] — the measurement stops when exceeded (protects the microswitch and the sensor).',
  measuretime:
    'Total measurement time [s] — length of the signal record (forward and return stroke).',
  meas_ts:
    'Measurement time from the PLC clock (Unix time) — shown as date and time. The PLC clock is not synchronised yet and may differ by hours or days; the reliable test time is in the header (saved by the PC).',
  positionreference:
    'Calibration constant C [µm] from the PLC — customer positions are calculated as P = C − x (x = drive travel). Depends on the start position of the drive and on the tip. Older files do not contain it (C is then derived from TTP).',
}

/** Nápověda parametru v jazyce UI; chybí-li anglická verze, vrátí českou. */
export function paramDesc(key: string, lang: 'cs' | 'en'): string | undefined {
  return lang === 'en' ? (PARAM_DESC_EN[key] ?? PARAM_DESC[key]) : PARAM_DESC[key]
}
