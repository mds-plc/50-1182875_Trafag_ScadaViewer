/**
 * @file paramMeta.ts
 * @description Sdílená metadata měřených parametrů — zkratky, anglické popisy, jednotky
 *   a JEDINÉ místo pro formátování hodnot (formatParam). Používají ho všechny pohledy:
 *   rozbalený řádek v Database (FileTable), detail zakázky (ChartView) i detail záznamu
 *   (RecordDiagram) — stejná hodnota se tak všude zobrazí stejně.
 *
 *   Jednotky zobrazení (zdroj dat = CSV z DatabaseGateway):
 *     Síly N (2 des. místa) · pozice a dráhy µm (celá čísla) · časy µs (celá čísla)
 *     Odpory: CSV je v Ω, zobrazují se v mΩ (×1000, 1 des. místo) — reálné hodnoty 5–950 mΩ.
 *     Rozepnutý kontakt: CSV hodnota 1 000 000 Ω → „∞".
 *   Exporty (CSV/XLSX) zůstávají v originálních jednotkách CSV.
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
  { id: 'forces',    label: 'Forces',    unit: 'N',   color: '#d97706',
    keys: ['of_operatingforce', 'rf_realisingforce', 'ttf_totaltravelforce'] },
  { id: 'positions', label: 'Positions', unit: 'µm',  color: '#2563eb',
    keys: ['fp_freeposition', 'op_operatingposition', 'rp_realeasingposition', 'ttp_totaltravelposition'] },
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
    ] },
]

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

/** Metadata sekce — klíče z [Metadata] bloku CSV. */
export const METADATA_KEYS = ['timestamp', 'microswitch_id', 'microswitch_name']

/** NokInfo sekce — klíče z [NokInfo] bloku CSV. */
export const NOKINFO_KEYS = ['nokreason', 'nokcategory_force', 'nokcategory_position',
  'nokcategory_electric', 'nokcategory_times', 'nokcategory_process']

/** MeasuredInfo sekce — klíče z [MeasuredInfo] bloku CSV. */
export const MEASUREDINFO_KEYS = ['measuretime', 'meas_ts']

/** MeasuredInfo jako skupina pro sdílenou ParamTable (Testing detail). */
export const MEASUREDINFO_GROUPS: { id: string; label: string; unit: string; color: string; keys: string[] }[] = [
  { id: 'measured', label: 'Measurement', unit: '', color: '#64748b', keys: MEASUREDINFO_KEYS },
]

/** Anglický popis zobrazený v tooltipu (klik/tap na záhlaví sloupce). */
export const PARAM_TOOLTIPS: Record<string, string> = {
  timestamp:        'Measurement Timestamp',
  microswitch_id:   'Microswitch ID',
  microswitch_name: 'Microswitch Type',
  sortingcategory:  'Sorting Category / box (1–4 OK · 5 NOK Trafag · 6 NOK Manufacturer)',
  status:           'Status (2 = OK · 5 = NOK)',
  // Forces
  of_operatingforce:           'Operating Force [N]',
  rf_realisingforce:           'Releasing Force [N]',
  ttf_totaltravelforce:        'Total Travel Force [N]',
  // Distances
  pt_pretravel:                'Pre-travel [µm] (OP − FP)',
  ot_overtravel:               'Overtravel [µm] (TTP − OP)',
  rt_realisingtravel:          'Releasing Travel [µm] (TTP − RP)',
  md_movementdifferential:     'Movement Differential [µm] (OP − RP)',
  tt_totaltravel:              'Total Travel [µm] (TTP − FP)',
  fp_freeposition:             'Free Position [µm]',
  op_operatingposition:        'Operating Position [µm]',
  rp_realeasingposition:       'Releasing Position [µm]',
  ttp_totaltravelposition:     'Total Travel Position [µm]',
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
  measuring_baseperiod:        'Measuring Base Period [ms]',
  measuring_oversampling:      'Measuring Oversampling [−]',
  measuring_samplesreserve:    'Measuring Samples Reserve [−]',
  limits_distancemax:          'Distance Limit Max [mm]',
  limits_forcemax:             'Force Limit Max [N]',
  // Measured info
  measuretime:                 'Measurement Duration [s]',
  meas_ts:                     'Measurement Timestamp [unix s]',
}

// ── Formátování hodnot — jediný zdroj pro všechny pohledy ────────────────────

/** CSV hodnota odporu ≥ této mezi = rozepnutý kontakt (DatabaseGateway zapisuje 1 000 000 Ω). */
export const OPEN_CONTACT_THRESHOLD = 999_999

/** Počet desetinných míst podle skupiny parametru. */
const GROUP_DECIMALS: Record<string, number> = {
  forces: 2, positions: 0, travel: 0, times: 0, electric: 1,
}

/** Klíč parametru → id skupiny (forces / positions / travel / times / electric). */
const KEY_GROUP: Record<string, string> = Object.fromEntries(
  PARAM_GROUPS.flatMap(g => g.keys.map(k => [k, g.id])),
)

/**
 * Vstupní parametry testu (Testing) — jednotka a desetinná místa.
 * Jednotky přesně dle hlavičky CSV z DatabaseGateway.
 */
const EXTRA_FORMAT: Record<string, { unit: string; decimals: number }> = {
  drive_distance:           { unit: 'mm',    decimals: 3 },
  drive_velocity:           { unit: 'mm/s',  decimals: 3 },
  drive_acceleration:       { unit: 'mm/s²', decimals: 1 },
  drive_deceleration:       { unit: 'mm/s²', decimals: 1 },
  drive_jerk:               { unit: 'mm/s³', decimals: 1 },
  electric_current:         { unit: 'mA',    decimals: 1 },   // hlavička CSV uvádí [A], hodnota je v mA (potvrzeno)
  electric_voltage:         { unit: 'V',     decimals: 1 },
  measuring_baseperiod:     { unit: 'ms',    decimals: 3 },
  measuring_oversampling:   { unit: '',      decimals: 0 },
  measuring_samplesreserve: { unit: '',      decimals: 0 },
  limits_distancemax:       { unit: 'mm',    decimals: 3 },
  limits_forcemax:          { unit: 'N',     decimals: 2 },
  measuretime:              { unit: 's',     decimals: 1 },
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

/**
 * Naformátuje hodnotu parametru pro zobrazení. Ne-parametry (timestamp, status…) vrací beze změny.
 * Odpory se převádí z Ω (CSV) na mΩ.
 */
export function formatParam(key: string, raw: unknown): FormattedParam {
  if (raw == null || String(raw).trim() === '') return { text: '—', open: false }
  const group = KEY_GROUP[key]
  const n = Number(raw)
  if (key === 'meas_ts' && !isNaN(n) && n > 0) {
    // unixový čas [s] → datum a čas (cs-CZ)
    return { text: new Date(n * 1000).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }), open: false }
  }
  const extra = EXTRA_FORMAT[key]
  if (extra && !isNaN(n)) return { text: n.toFixed(extra.decimals), open: false }
  if (!group || isNaN(n)) return { text: String(raw), open: false }
  if (n >= OPEN_CONTACT_THRESHOLD) return { text: '∞', open: true }
  const value = group === 'electric' ? n * 1000 : n
  return { text: value.toFixed(GROUP_DECIMALS[group] ?? 2), open: false }
}

/** true pokud má parametr aspoň v jednom záznamu měřenou hodnotu (ne prázdnou, ne ∞). */
export function hasMeasuredValue(key: string, records: Record<string, unknown>[]): boolean {
  return records.some(r => {
    const v = r[key]
    if (v == null || String(v).trim() === '') return false
    const n = Number(v)
    return isNaN(n) || n < OPEN_CONTACT_THRESHOLD
  })
}

/** Všechny měřené parametry v pořadí skupin (Forces, Positions, Travel, Times, Electric). */
export const ALL_PARAM_KEYS: string[] = PARAM_GROUPS.flatMap(g => g.keys)

// ── České popisy parametrů ──────────────────────────────────────────────────

/** Český popis parametru (nápověda „?" v tabulkách parametrů) — význam, výpočet, jednotka. */
export const PARAM_DESC: Record<string, string> = {
  of_operatingforce:
    'Síla [N] v bodě sepnutí (OP). Pokud je příliš velká nebo malá, spínač neodpovídá specifikaci.',
  rf_realisingforce:
    'Síla [N] při uvolnění kontaktu na zpáteční cestě (RP). Spolu s OF definuje silovou hysterezi.',
  ttf_totaltravelforce:
    'Maximální síla [N] na konci zdvihu (TTP). Nesmí překročit povolenou mez pro daný typ.',
  fp_freeposition:
    'Výchozí poloha kladky [µm] bez vnější síly — referenční bod pro všechny délkové hodnoty.',
  op_operatingposition:
    'Poloha [µm] bodu sepnutí kontaktu na dopředné cestě (absolutní poloha). PT = OP − FP.',
  rp_realeasingposition:
    'Poloha [µm] bodu uvolnění kontaktu na zpáteční cestě (absolutní poloha). MD = OP − RP.',
  ttp_totaltravelposition:
    'Poloha [µm] konce zdvihu — nejhlubší bod stlačení při měření. TT = TTP − FP.',
  pt_pretravel:
    'Předzdvih [µm] — dráha od FP do OP (PT = OP − FP). Musí být dostatečná pro spolehlivé sepnutí.',
  ot_overtravel:
    'Přezdvih [µm] — rezerva za bodem sepnutí (OT = TTP − OP). Chrání kontakt před přetížením.',
  rt_realisingtravel:
    'Uvolňovací zdvih [µm] — dráha od konce zdvihu zpět do bodu uvolnění (RT = TTP − RP).',
  md_movementdifferential:
    'Diferenciál pohybu [µm] — vzdálenost mezi OP a RP (MD = OP − RP, polohová hystereze). Větší MD = stabilnější přepínání.',
  tt_totaltravel:
    'Celkový zdvih [µm] — dráha od FP do TTP (TT = TTP − FP).',
  ut_unstabletime:
    'Nestabilní čas [µs] — délka kmitů kontaktu těsně po sepnutí, než se kontakt definitivně otevře.',
  rt_reversetime:
    'Čas reverzu [µs] — okno, ve kterém kontakt dočasně reverzuje zpět k zavřenému stavu (NC se krátce uzavře).',
  bt_bouncetime:
    'Čas odskoku [µs] — celková délka zákmitů po sepnutí. Delší BT = více šumu, pomalejší odezva.',
  ot_operatingtime:
    'Čas sepnutí [µs] — celková doba spínání, součet UT + RevT + BT.',
  r_nc_operatingposition_neg:
    'Odpor [mΩ] normálně zavřeného (NC) kontaktu v bodě sepnutí (OP), záporný pól. Vysoký odpor = degradace.',
  r_nc_operatingposition_pos:
    'Odpor [mΩ] NC kontaktu v bodě sepnutí (OP), kladný pól.',
  r_nc_releasingposition_neg:
    'Odpor [mΩ] NC kontaktu v bodě uvolnění (RP), záporný pól.',
  r_nc_releasingposition_pos:
    'Odpor [mΩ] NC kontaktu v bodě uvolnění (RP), kladný pól.',
  r_no_operatingposition_neg:
    'Odpor [mΩ] normálně otevřeného (NO) kontaktu v bodě sepnutí (OP), záporný pól. Nízký odpor = správně uzavřeno.',
  r_no_operatingposition_pos:
    'Odpor [mΩ] NO kontaktu v bodě sepnutí (OP), kladný pól.',
  r_no_releasingposition_neg:
    'Odpor [mΩ] NO kontaktu v bodě uvolnění (RP), záporný pól.',
  r_no_releasingposition_pos:
    'Odpor [mΩ] NO kontaktu v bodě uvolnění (RP), kladný pól.',
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
    'Měřicí proud kontaktem nastavený pro test [mA] (hlavička CSV chybně uvádí [A]).',
  electric_voltage:
    'Napětí měřicího obvodu kontaktů [V].',
  measuring_baseperiod:
    'Základní perioda vzorkování měření [ms].',
  measuring_oversampling:
    'Převzorkování — kolik vzorků se pořizuje na jednu základní periodu.',
  measuring_samplesreserve:
    'Rezerva vzorků — počet vzorků navíc zaznamenaných před a po měření.',
  limits_distancemax:
    'Maximální povolená dráha [mm] — při překročení se měření přeruší (ochrana mikrospínače).',
  limits_forcemax:
    'Maximální povolená síla [N] — při překročení se měření přeruší (ochrana mikrospínače i snímače).',
  measuretime:
    'Celková doba měření [s] — délka záznamu signálu (dopředný i zpětný chod).',
  meas_ts:
    'Čas měření zapsaný PLC (unixový čas) — zobrazen jako datum a čas.',
}
