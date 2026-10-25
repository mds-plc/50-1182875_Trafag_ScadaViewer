/**
 * @file ParamDiagrams.tsx
 * @description Diagramy analyzovaných parametrů mikrospínače — sdílené detailem záznamu
 *   (RecordDiagram) a grafickou nápovědou parametru (ParamExplainModal):
 *   1. ForceTravelDiagram — hysterezní smyčka s kótami (vzor: původní SCADA screen 29)   viewBox 0 0 840 500
 *   2. TimeDiagram        — U_NC + U_NO při sepnutí (vzor: osciloskop IMG_4818), časy v měřítku   viewBox 0 0 840 470
 *
 *   `highlight` (klíč parametru, např. 'pt_pretravel'): zvýrazní kótu / bod parametru a body,
 *   mezi kterými se měří (PT → FP a OP), ostatní kóty ztlumí; smyčka / průběhy zůstanou jako kontext.
 *   Bez `highlight` se kreslí všechno jako dřív.
 */

import { useId } from 'react'
import { PARAM_LABELS, formatParam } from '../utils/paramMeta'
import { useLang } from '../context/LangContext'

export interface DiagramProps {
  record:     Record<string, unknown>
  /** Klíč parametru ke zvýraznění (grafická nápověda); bez něj normální zobrazení */
  highlight?: string
}

/** Který diagram parametr vysvětluje — klíče mimo mapu (vstupy testu, měření) graf nemají. */
export const PARAM_DIAGRAM: Readonly<Record<string, 'force' | 'time'>> = {
  of_operatingforce: 'force', rf_realisingforce: 'force', ttf_totaltravelforce: 'force', df_differentialforce: 'force',
  fp_freeposition: 'force', op_operatingposition: 'force', rp_realeasingposition: 'force', ttp_totaltravelposition: 'force',
  fpr_freepositionreturn: 'force',
  pt_pretravel: 'force', ot_overtravel: 'force', rt_realisingtravel: 'force', md_movementdifferential: 'force', tt_totaltravel: 'force',
  r_nc_operatingposition_neg: 'force', r_nc_operatingposition_pos: 'force',
  r_no_operatingposition_neg: 'force', r_no_operatingposition_pos: 'force',
  r_nc_releasingposition_neg: 'force', r_nc_releasingposition_pos: 'force',
  r_no_releasingposition_neg: 'force', r_no_releasingposition_pos: 'force',
  r_nc_static: 'force', r_no_static: 'force',
  ut_unstabletime: 'time', rt_reversetime: 'time', bt_bouncetime: 'time', ot_operatingtime: 'time',
}

/** Prvky diagramu, které se rozsvítí s parametrem — kóta / bod + body, ze kterých se počítá. */
const RELATED: Readonly<Record<string, readonly string[]>> = {
  pt_pretravel:            ['fp_freeposition', 'op_operatingposition'],                // PT = FP − OP
  ot_overtravel:           ['op_operatingposition', 'ttp_totaltravelposition'],        // OT = OP − TTP
  rt_realisingtravel:      ['rp_realeasingposition', 'ttp_totaltravelposition'],       // RT = RP − TTP
  md_movementdifferential: ['rp_realeasingposition', 'op_operatingposition'],          // MD = RP − OP
  tt_totaltravel:          ['fp_freeposition', 'ttp_totaltravelposition'],             // TT = FP − TTP
  of_operatingforce:       ['op_operatingposition'],
  rf_realisingforce:       ['rp_realeasingposition'],
  ttf_totaltravelforce:    ['ttp_totaltravelposition'],
  df_differentialforce:    ['of_operatingforce', 'rf_realisingforce', 'op_operatingposition'],   // DF = OF − RF
  fpr_freepositionreturn:  ['fp_freeposition', 'rp_realeasingposition'],                  // zpětný chod za RP, ≈ FP
  r_nc_operatingposition_neg: ['op_operatingposition'], r_nc_operatingposition_pos: ['op_operatingposition'],
  r_no_operatingposition_neg: ['op_operatingposition'], r_no_operatingposition_pos: ['op_operatingposition'],
  r_nc_releasingposition_neg: ['rp_realeasingposition'], r_nc_releasingposition_pos: ['rp_realeasingposition'],
  r_no_releasingposition_neg: ['rp_realeasingposition'], r_no_releasingposition_pos: ['rp_realeasingposition'],
  r_nc_static:             ['fp_freeposition', 'op_operatingposition', 'rp_realeasingposition'],   // NC sepnutý: před OP, za RP
  r_no_static:             ['op_operatingposition', 'rp_realeasingposition'],                       // NO sepnutý: OP … RP
  ot_operatingtime:        ['ut_unstabletime', 'rt_reversetime', 'bt_bouncetime'],     // OpT = UT + RevT + BT
}

const DIM = 0.12        // ztlumené prvky při zvýraznění
const CONTEXT = 0.45    // smyčka / průběhy / osy — kontext zůstane čitelný

/** Zvýraznění: `on(tag…)` = prvek patří k parametru; `op` = opacity; `sw` = zesílená čára. */
function useHighlight(highlight?: string) {
  const lit = highlight ? new Set([highlight, ...(RELATED[highlight] ?? [])]) : null
  const on = (...tags: string[]) => lit !== null && tags.some(t => lit.has(t))
  return {
    active: lit !== null,
    on,
    op:  (...tags: string[]) => (lit === null || on(...tags) ? 1 : DIM),
    ctx: lit === null ? 1 : CONTEXT,
    sw:  (base: number, ...tags: string[]) => (on(...tags) ? base * 2 : base),
  }
}

/** Hodnota parametru pro zobrazení — sdílené formatParam (mN, µm 0,1, µs, mΩ, ∞). */
function makeVal(record: Record<string, unknown>) {
  return (key: string): string => formatParam(key, record[key]).text
}

const lbl = (key: string, fallback: string) => PARAM_LABELS[key] ?? fallback

// ── Malá pomocná komponenta: popisný štítek bodu na křivce ──────────────────

function PointLabel({ x, y, label, value, dx = 8, dy = 0, anchor = 'start', color = '#374151', opacity = 1 }: {
  x: number; y: number; label: string; value?: string
  dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end'; color?: string; opacity?: number
}) {
  return (
    <g opacity={opacity}>
      <rect x={x + dx - 2} y={y + dy - 10} width={value ? 68 : 34} height={value ? 20 : 13}
        rx={3} fill="white" stroke={color} strokeWidth={0.5} opacity={0.88} />
      <text x={x + dx + 2} y={y + dy} fontSize={9} fontWeight="700" fill={color}
        textAnchor={anchor}>
        {label}{value ? ` = ${value}` : ''}
      </text>
    </g>
  )
}

// ── Diagram 1: Hysterezní smyčka s kótami (screen 29) ───────────────────────

export function ForceTravelDiagram({ record, highlight }: DiagramProps) {
  const { t } = useLang()
  const val = makeVal(record)
  const uid = useId()
  const h = useHighlight(highlight)

  // Pevné souřadnice (schéma, neškálováno)
  const FP_x  = 200
  const RP_x  = 358
  const OP_x  = 505
  const TTP_x = 700

  // Y souřadnice (nižší y = vyšší síla = výše na obrazovce)
  const y_zero = 365   // nulová síla
  const y_OF   = 168   // Operating Force
  const y_RF   = 228   // Releasing Force
  const y_TTF  = 100   // Total Travel Force

  // Sklon pružiny — stejný pro všechny 4 větve smyčky
  const s    = (y_zero - y_OF) / (OP_x - FP_x)           // ≈ 0.646
  const s_lo = (y_RF - y_TTF) / (TTP_x - OP_x)           // ≈ 0.656
  // Body zpětné cesty
  const y_RP_upper  = Math.round(y_zero - s * (RP_x - FP_x))          // ≈ 262
  const y_RP_return = Math.round(y_TTF  + s_lo * (TTP_x - RP_x))      // ≈ 323

  const C_FWD    = '#1e293b'   // přední cesta (plná)
  const C_RET    = '#94a3b8'   // zpětná cesta (přerušovaná)
  const C_FORCE  = '#d97706'   // žlutá — síly
  const C_TRAVEL = '#2563eb'   // modrá — zdvihy
  const C_AXIS   = '#6b7280'
  const C_DASH   = '#e2e8f0'
  const C_RES    = '#7c3aed'
  const AS = 7
  // DF / FPR jen u souborů, které je mají (Analyzing 2.4.0+), nebo v grafické nápovědě parametru
  const hasDF  = 'df_differentialforce' in record || highlight === 'df_differentialforce'
  const hasFPR = 'fpr_freepositionreturn' in record || highlight === 'fpr_freepositionreturn'
  const hasStatic = 'r_nc_static' in record || highlight === 'r_nc_static' || highlight === 'r_no_static'
  // FPR = kde síla na zpětné větvi RP → FP klesne do šumu — schematicky těsně před FP
  const FPR_x = FP_x + 24
  const y_FPR = Math.round(y_zero - s * (FPR_x - FP_x))

  const POS = [
    { x: FP_x,  l: 'FP',  k: 'fp_freeposition' },
    { x: RP_x,  l: 'RP',  k: 'rp_realeasingposition' },
    { x: OP_x,  l: 'OP',  k: 'op_operatingposition' },
    { x: TTP_x, l: 'TTP', k: 'ttp_totaltravelposition' },
  ]

  // Zdvihová kóta pod osou (řada y) — PT / OvT / RvT / MD / TT
  const travel = (key: string, xa: number, xb: number, y: number, fallback: string) => (
    <g opacity={h.op(key)}>
      {h.on(key) && <rect x={xa} y={y - 15} width={xb - xa} height={28} rx={4} fill={C_TRAVEL} opacity={0.08} />}
      <line x1={xa + 4} y1={y} x2={xb - 4} y2={y}
        stroke={C_TRAVEL} strokeWidth={h.sw(1.5, key)} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(xa + xb) / 2} y={y - 3} textAnchor="middle" fontSize={h.on(key) ? 11 : 9} fontWeight="700" fill={C_TRAVEL}>
        {lbl(key, fallback)}
      </text>
      <text x={(xa + xb) / 2} y={y + 12} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val(key)}
      </text>
    </g>
  )

  // Silová kóta na Y-ose — TTF / OF / RF
  const forceDim = (key: string, x: number, yTop: number, label: string) => (
    <g opacity={h.op(key)}>
      <line x1={x} y1={y_zero - 5} x2={x} y2={yTop + 5}
        stroke={C_FORCE} strokeWidth={h.sw(1.5, key)} markerEnd={`url(#${uid}ftF)`} markerStart={`url(#${uid}ftFR)`} />
      <text x={x} y={(y_zero + yTop) / 2} transform={`rotate(-90, ${x}, ${(y_zero + yTop) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>{label}</text>
      <rect x={x - 12} y={yTop - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={x} y={yTop - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val(key)}</text>
    </g>
  )

  // Box odporů kontaktů v bodě (RP / OP)
  const resBox = (x0: number, title: string, keys: { ncN: string; ncP: string; noN: string; noP: string },
                  toX: number, toY: number) => {
    const all = [keys.ncN, keys.ncP, keys.noN, keys.noP]
    const cell = (k: string, label: string, x: number, y: number) => (
      <g opacity={h.active && !h.on(k) ? 0.35 : 1}>
        {h.on(k) && <rect x={x - 3} y={y - 9} width={78} height={12} rx={2} fill={C_RES} opacity={0.18} />}
        <text x={x} y={y} fontSize={8.5} fontWeight="700" fill={C_RES}>{label}</text>
        <text x={x + 20} y={y} fontSize={8.5} fill="#374151" fontFamily="monospace">{val(k)}</text>
      </g>
    )
    return (
      <g opacity={h.op(...all)}>
        <rect x={x0} y={74} width={178} height={44} rx={4} fill="white" stroke={C_RES}
          strokeWidth={h.sw(1, ...all)} opacity={0.95} />
        <rect x={x0} y={74} width={178} height={15} rx={4} fill={C_RES} opacity={0.13} />
        <text x={x0 + 6} y={85} fontSize={9} fontWeight="700" fill={C_RES}>{title}</text>
        {cell(keys.ncN, 'NC−', x0 + 6, 99)}
        {cell(keys.ncP, 'NC+', x0 + 90, 99)}
        {cell(keys.noN, 'NO−', x0 + 6, 112)}
        {cell(keys.noP, 'NO+', x0 + 90, 112)}
        <line x1={x0 + 89} y1={118} x2={toX} y2={toY}
          stroke={C_RES} strokeWidth={h.sw(0.9, ...all)} strokeDasharray="3,3" opacity={h.on(...all) ? 0.9 : 0.45} />
      </g>
    )
  }

  return (
    <svg className="rd-svg" viewBox="0 0 840 500" xmlns="http://www.w3.org/2000/svg"
      aria-label={t.chart.forceTravelAria}>
      <defs>
        <marker id={uid + 'ftB'}  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TRAVEL} /></marker>
        <marker id={uid + 'ftBL'} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TRAVEL} /></marker>
        <marker id={uid + 'ftF'}  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_FORCE} /></marker>
        <marker id={uid + 'ftFR'} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_FORCE} /></marker>
        <marker id={uid + 'dfA'}  markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={C_FORCE} /></marker>
        <marker id={uid + 'dfAR'} markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={C_FORCE} /></marker>
      </defs>

      {/* ── Osy ── */}
      <g opacity={h.ctx}>
        <line x1={145} y1={380} x2={145} y2={22} stroke={C_AXIS} strokeWidth={1.5} />
        <polygon points={`145,22 ${145-AS/2},${22+AS*1.5} ${145+AS/2},${22+AS*1.5}`} fill={C_AXIS} />
        <text x={140} y={19} textAnchor="end" fontSize={11} fill={C_AXIS}>Force [mN]</text>
        <line x1={135} y1={y_zero} x2={730} y2={y_zero} stroke={C_AXIS} strokeWidth={1.5} />
        <polygon points={`730,${y_zero} ${730-AS*1.5},${y_zero-AS/2} ${730-AS*1.5},${y_zero+AS/2}`} fill={C_AXIS} />
        <text x={736} y={y_zero+4} fontSize={11} fill={C_AXIS}>Travel [µm]</text>
      </g>

      {/* ── Vodorovné referenční čáry sil (jemná mřížka; zvýrazněná síla výrazně) ── */}
      {([['ttf_totaltravelforce', y_TTF], ['of_operatingforce', y_OF], ['rf_realisingforce', y_RF]] as const).map(([k, y]) => (
        <line key={k} x1={148} y1={y} x2={TTP_x} y2={y} stroke={C_FORCE} strokeWidth={h.on(k) ? 1.4 : 0.8}
          strokeDasharray="5,4" opacity={h.on(k) ? 0.75 : 0.18} />
      ))}

      {/* ── Mřížka: svislé přerušované čáry pozic (zvýrazněná pozice modře) ── */}
      {POS.map(p => (
        <line key={p.k} x1={p.x} y1={30} x2={p.x} y2={y_zero}
          stroke={h.on(p.k) ? C_TRAVEL : C_DASH} strokeWidth={h.on(p.k) ? 1.6 : 1} strokeDasharray="5,4"
          opacity={h.on(p.k) ? 0.8 : 1} />
      ))}

      {/* ══ HYSTEREZNÍ SMYČKA (kontext) ══ */}
      <g opacity={h.ctx}>
        {/* Přední cesta (lisování): A→B, B→C (skok), C→D */}
        <line x1={FP_x} y1={y_zero} x2={OP_x}  y2={y_OF}  stroke={C_FWD} strokeWidth={2.5} />
        <line x1={OP_x} y1={y_OF}   x2={OP_x}  y2={y_RF}  stroke={C_FWD} strokeWidth={2.5} />
        <line x1={OP_x} y1={y_RF}   x2={TTP_x} y2={y_TTF} stroke={C_FWD} strokeWidth={2.5} />
        {/* Zpětná cesta (uvolňování): D→E, E→F (skok), F→A — přerušovaná */}
        <line x1={TTP_x} y1={y_TTF}      x2={RP_x} y2={y_RP_return} stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
        <line x1={RP_x}  y1={y_RP_return} x2={RP_x} y2={y_RP_upper}  stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
        <line x1={RP_x}  y1={y_RP_upper}  x2={FP_x} y2={y_zero}      stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
      </g>

      {/* ── Uzlové body smyčky (zvýrazněný bod větší) ── */}
      <circle cx={FP_x}  cy={y_zero}      r={h.on('fp_freeposition') ? 8 : 5} fill="white" stroke={C_FWD} strokeWidth={2}
        opacity={h.op('fp_freeposition')} />
      <circle cx={OP_x}  cy={y_OF}        r={h.on('op_operatingposition', 'of_operatingforce') ? 8 : 5} fill={C_FWD}
        opacity={h.op('op_operatingposition', 'of_operatingforce')} />
      <circle cx={OP_x}  cy={y_RF}        r={5} fill={C_FWD} opacity={h.op('op_operatingposition', 'rf_realisingforce')} />
      <circle cx={TTP_x} cy={y_TTF}       r={h.on('ttp_totaltravelposition', 'ttf_totaltravelforce') ? 8 : 5} fill={C_FWD}
        opacity={h.op('ttp_totaltravelposition', 'ttf_totaltravelforce')} />
      <circle cx={RP_x}  cy={y_RP_return} r={h.on('rp_realeasingposition') ? 8 : 5} fill="white" stroke={C_RET} strokeWidth={2}
        opacity={h.op('rp_realeasingposition')} />
      <circle cx={RP_x}  cy={y_RP_upper}  r={h.on('rp_realeasingposition') ? 8 : 5} fill="white" stroke={C_RET} strokeWidth={2}
        opacity={h.op('rp_realeasingposition')} />
      {hasFPR && (
        <g opacity={h.op('fpr_freepositionreturn')}>
          <circle cx={FPR_x} cy={y_FPR} r={h.on('fpr_freepositionreturn') ? 7 : 4} fill="white" stroke={C_TRAVEL} strokeWidth={2} />
          <PointLabel x={FPR_x} y={y_FPR} label={lbl('fpr_freepositionreturn', 'FPR')}
            value={val('fpr_freepositionreturn')} dx={14} dy={-24} color={C_TRAVEL} />
        </g>
      )}

      {/* ── Kóty bodů — štítky přímo na křivce ── */}
      {/* vlevo od bodu — vpravo nad FP leží bod FPR (zpětná větev) */}
      <PointLabel x={FP_x} y={y_zero} label="FP" dx={-42} dy={-14} color={C_FWD} opacity={h.op('fp_freeposition')} />
      <PointLabel x={OP_x} y={y_OF}  label="OF" value={val('of_operatingforce')}
        dx={10} dy={-6} color={C_FORCE} opacity={h.op('op_operatingposition', 'of_operatingforce')} />
      <PointLabel x={OP_x} y={y_RF}  label="RF" value={val('rf_realisingforce')}
        dx={10} dy={8} color={C_FORCE} opacity={h.op('rf_realisingforce')} />
      <PointLabel x={TTP_x} y={y_TTF} label="TTF" value={val('ttf_totaltravelforce')}
        dx={8} dy={-6} color={C_FORCE} opacity={h.op('ttp_totaltravelposition', 'ttf_totaltravelforce')} />
      <g opacity={h.op('rp_realeasingposition')}>
        <text x={RP_x + 8} y={y_RP_upper  + 4} textAnchor="start" fontSize={8.5} fontWeight="700" fill={C_RET} opacity={0.8}>RP↑</text>
        <text x={RP_x + 8} y={y_RP_return + 13} textAnchor="start" fontSize={8.5} fontWeight="700" fill={C_RET} opacity={0.8}>RP↓</text>
      </g>

      {/* ── Silový diferenciál ΔF (OF − RF) u OP a na Y-ose ── */}
      <g opacity={h.op('of_operatingforce', 'rf_realisingforce', 'df_differentialforce')}>
        {h.on('df_differentialforce') && (
          <rect x={OP_x+12} y={y_OF} width={84} height={y_RF - y_OF} rx={4} fill={C_FORCE} opacity={0.1} />
        )}
        <line x1={OP_x+18} y1={y_OF+4}  x2={OP_x+18} y2={y_RF-4}
          stroke={C_FORCE} strokeWidth={h.sw(1.2, 'df_differentialforce')} markerEnd={`url(#${uid}dfA)`} markerStart={`url(#${uid}dfAR)`} />
        {/* bílý podklad — přes popisek vede dopředná větev smyčky OP → TTP */}
        {hasDF && <rect x={OP_x+22} y={(y_OF+y_RF)/2-7} width={h.on('df_differentialforce') ? 66 : 56} height={15}
          rx={3} fill="white" stroke={C_FORCE} strokeWidth={0.5} opacity={0.92} />}
        <text x={OP_x+26} y={(y_OF+y_RF)/2+4} fontSize={h.on('df_differentialforce') ? 11 : 9} fill={C_FORCE} fontWeight="700">
          {hasDF ? `${lbl('df_differentialforce', 'DF')} = ${val('df_differentialforce')}` : 'ΔF'}
        </text>
        <line x1={96} y1={y_OF + 4} x2={96} y2={y_RF - 4}
          stroke={C_FORCE} strokeWidth={1.2} markerEnd={`url(#${uid}dfA)`} markerStart={`url(#${uid}dfAR)`} />
        <text x={103} y={(y_OF + y_RF) / 2 + 4} textAnchor="start" fontSize={8} fontWeight="700" fill={C_FORCE}>ΔF</text>
      </g>

      {/* ── Silové kóty na Y-ose — TTF / OF / RF (screen 29) ── */}
      {forceDim('ttf_totaltravelforce', 30, y_TTF, 'TTF')}
      {forceDim('of_operatingforce',    52, y_OF,  'OF')}
      {forceDim('rf_realisingforce',    74, y_RF,  'RF')}

      {/* ── Popisky pozic pod X-osou: zkratka + naměřená poloha [µm] ── */}
      {POS.map(p => (
        <text key={p.l} x={p.x} y={y_zero+22} textAnchor="middle"
          fontSize={h.on(p.k) ? 12 : 10} fontWeight="700" fill={h.on(p.k) ? C_TRAVEL : C_AXIS}
          opacity={h.op(p.k)}>{p.l} <tspan fontWeight="400" fontFamily="monospace" fill={C_TRAVEL}>{val(p.k)}</tspan></text>
      ))}

      {/* ── Zdvihové kóty pod osou (modrá) — 4 řady dle screen 29 ── */}
      {travel('md_movementdifferential', RP_x, OP_x,  400, 'MD')}   {/* MD  = RP − OP  (Differenzweg) */}
      {travel('pt_pretravel',            FP_x, OP_x,  425, 'PT')}   {/* PT  = FP − OP  (Vorlaufweg) */}
      {travel('ot_overtravel',           OP_x, TTP_x, 425, 'OvT')}  {/* OvT = OP − TTP (Nachlaufweg) */}
      {travel('rt_realisingtravel',      RP_x, TTP_x, 450, 'RvT')}  {/* RvT = RP − TTP (Rücklaufweg) */}
      {travel('tt_totaltravel',          FP_x, TTP_x, 475, 'TT')}   {/* TT  = FP − TTP (Gesamtweg) */}

      {/* ── Odpory kontaktů [mΩ] v RP a OP (fialová) ── */}
      {resBox(194, 'RP Contacts [mΩ]', {
        ncN: 'r_nc_releasingposition_neg', ncP: 'r_nc_releasingposition_pos',
        noN: 'r_no_releasingposition_neg', noP: 'r_no_releasingposition_pos',
      }, RP_x, y_RP_upper - 10)}
      {resBox(420, 'OP Contacts [mΩ]', {
        ncN: 'r_nc_operatingposition_neg', ncP: 'r_nc_operatingposition_pos',
        noN: 'r_no_operatingposition_neg', noP: 'r_no_operatingposition_pos',
      }, OP_x, y_OF - 10)}

      {/* Statický odpor sepnutých kontaktů mimo přepnutí (od 2026-10-22) */}
      {hasStatic && (
        <g opacity={h.op('r_nc_static', 'r_no_static')}>
          <rect x={612} y={22} width={150} height={44} rx={4} fill="white" stroke={C_RES}
            strokeWidth={h.sw(1, 'r_nc_static', 'r_no_static')} opacity={0.95} />
          <rect x={612} y={22} width={150} height={15} rx={4} fill={C_RES} opacity={0.13} />
          <text x={618} y={33} fontSize={9} fontWeight="700" fill={C_RES}>Static [mΩ]</text>
          {([['r_nc_static', 'NC', 618], ['r_no_static', 'NO', 690]] as const).map(([k, l, x]) => (
            <g key={k} opacity={h.active && !h.on(k) ? 0.35 : 1}>
              {h.on(k) && <rect x={x - 3} y={47} width={68} height={12} rx={2} fill={C_RES} opacity={0.18} />}
              <text x={x} y={56} fontSize={8.5} fontWeight="700" fill={C_RES}>{l}</text>
              <text x={x + 18} y={56} fontSize={8.5} fill="#374151" fontFamily="monospace">{val(k)}</text>
            </g>
          ))}
        </g>
      )}

      {/* Legenda */}
      <g opacity={h.ctx}>
        <line x1={710} y1={160} x2={742} y2={160} stroke={C_FWD} strokeWidth={2.5} />
        <text x={747} y={164} fontSize={10} fill="#64748b">{t.chart.sigForward}</text>
        <line x1={710} y1={178} x2={742} y2={178} stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
        <text x={747} y={182} fontSize={10} fill="#64748b">{t.chart.sigReverse}</text>
      </g>
    </svg>
  )
}

// ── Diagram 2: Časové parametry přepnutí — průběh U_NC a U_NO (osciloskop) ────
//
// VZOR: záznam osciloskopu při sepnutí mikrospínače (05_user_data/IMG_4818.JPEG):
//   U_NC (na začátku dole, 0 V = NC sepnut) — v OP se NC rozepne, napětí stoupá zaoblenou
//        hranou na 10 V → úsek UT (Unstable Time)
//   oba kontakty rozepnuté → úsek RevT (Reverse Time) do prvního dotyku NO
//   U_NO (na začátku nahoře, 10 V = NO rozepnut) — NO sepne se zákmity a ustálí se na 0 V
//        → úsek BT (Bounce Time)
//   OpT (Operating Time) = UT + RevT + BT — ověřeno na 215 reálných záznamech.
//
// Časová osa je v MĚŘÍTKU skutečných hodnot záznamu (0 = OP), jako mřížka osciloskopu.
// Průběhy jsou schematické (produkční záznam nemá surový signál) — tvar hran a zákmitů je
// ilustrativní, polohy hran a délky úseků odpovídají naměřeným časům.
// Výjimka: úsek kratší než MIN_SEGMENT_PX (RevT stovky ms vedle UT / BT 0,2 ms) by se slil
// do svislé čáry → dostane minimální šířku, delší úseky se zkrátí („//" na ose, dílky jen v událostech).

/** Minimální šířka úseku UT / RevT / BT [px] — kratší by v diagramu splynul se svislou čarou. */
const MIN_SEGMENT_PX = 64

/**
 * Po částech lineární časová osa: úseky mezi `knots` [µs] úměrně délce, ale každý vnitřní úsek
 * (UT, RevT, BT) aspoň MIN_SEGMENT_PX. `compressed` = úseky zkrácené pod skutečné měřítko
 * (prázdné = osa v měřítku).
 */
export function timeScale(knots: number[], x0: number, x1: number) {
  const n = knots.length - 1
  const len = knots.slice(1).map((t, i) => Math.max(0, t - knots[i]))
  // Okraje (před OP / za BT) a úsek nulové délky bez minima — nulový úsek nesmí udělat mezeru
  const minPx = len.map((l, i): number => (i === 0 || i === n - 1 || l <= 0 ? 0 : MIN_SEGMENT_PX))
  const width = x1 - x0
  const px = new Array<number>(n).fill(0)
  const fixed = new Array<boolean>(n).fill(false)
  // Opakovaně: úseky, které by vyšly pod minimum, zafixovat na minimu, zbytek rozdělit úměrně
  for (let iter = 0; iter < n; iter++) {
    const freeLen = len.reduce((s, l, i) => (fixed[i] ? s : s + l), 0)
    const freePx  = width - minPx.reduce((s, m, i) => (fixed[i] ? s + m : s), 0)
    let changed = false
    for (let i = 0; i < n; i++) {
      if (fixed[i]) { px[i] = minPx[i]; continue }
      px[i] = freeLen > 0 ? (len[i] / freeLen) * freePx : freePx / n
      if (px[i] < minPx[i]) { fixed[i] = true; changed = true }
    }
    if (!changed) break
  }
  const anyFixed = fixed.some(Boolean)
  const compressed: [number, number][] = anyFixed
    ? knots.slice(1).map((t, i) => [knots[i], t] as [number, number])
        // značku „//" jen u výrazně dlouhého úseku — krátký zkrácený úsek by ji měl zbytečně
        .filter((_, i) => !fixed[i] && len[i] > 0 && i > 0 && i < n - 1 && px[i] >= 2 * MIN_SEGMENT_PX)
    : []
  const edges = [x0]
  for (const p of px) edges.push(edges[edges.length - 1] + p)
  const x = (tUs: number) => {
    if (tUs <= knots[0]) return x0
    for (let i = 0; i < n; i++) {
      if (tUs <= knots[i + 1]) {
        return len[i] > 0 ? edges[i] + ((tUs - knots[i]) / len[i]) * px[i] : edges[i + 1]
      }
    }
    return x1
  }
  return { x, compressed }
}

/** Zákmity NO během BT: [podíl šířky BT, úroveň 0 = LOW … 1 = HIGH] — schematický tvar. */
const NO_BOUNCES: [number, number][] = [
  [0.00, 0], [0.10, 0], [0.10, 1], [0.18, 1], [0.18, 0], [0.30, 0], [0.30, 0.85], [0.36, 0.85],
  [0.36, 0], [0.46, 0], [0.46, 1], [0.50, 1], [0.50, 0], [0.78, 0], [0.78, 0.6], [0.81, 0.6], [0.81, 0],
]

export function TimeDiagram({ record, highlight }: DiagramProps) {
  const { t } = useLang()
  const val = makeVal(record)
  const uid = useId()
  const h = useHighlight(highlight)

  const num = (k: string) => {
    const n = Number(record[k])
    return isFinite(n) && n > 0 ? n : 0
  }
  const utRaw = num('ut_unstabletime'), revRaw = num('rt_reversetime'), btRaw = num('bt_bouncetime')
  const hasTimes = utRaw + revRaw + btRaw > 0
  // Bez naměřených časů jen ilustrace s typickými poměry (hodnoty kót pak „—")
  const UT  = hasTimes ? utRaw  : 200
  const REV = hasTimes ? revRaw : 2700
  const BT  = hasTimes ? btRaw  : 200
  const OPT = UT + REV + BT

  const C_NC   = '#16a34a'   // shodně se Signal Data grafy
  const C_NO   = '#c026d3'
  const C_TIME = '#059669'
  const C_AXIS = '#6b7280'
  const C_GRID = '#e5e7eb'
  const BAND = { ut: '#f59e0b', rev: '#6366f1', bt: '#ef4444' }

  // Plocha grafu
  const X0 = 90, X1 = 790                  // okraje časové osy
  const Y_HIGH = 80, Y_LOW = 220           // 10 V / 0 V
  const Y_AXIS = 240

  // Měřítko: před OP 15 %, za koncem BT 15 % z OpT (min. 150 µs), zbytek úměrně
  const pre  = Math.max(OPT * 0.15, 150)
  const post = Math.max(OPT * 0.15, 150)
  const tMin = -pre, tMax = OPT + post
  const tOp = 0, tUt = UT, tNo = UT + REV, tEnd = OPT
  const { x, compressed } = timeScale([tMin, tOp, tUt, tNo, tEnd, tMax], X0, X1)
  const xOp = x(tOp), xUt = x(tUt), xNo = x(tNo), xEnd = x(tEnd)
  const scaled = compressed.length === 0

  // U_NC: LOW → v OP zaoblený náběh (UT) → HIGH
  const ncPath = [
    `M ${X0} ${Y_LOW}`, `L ${xOp} ${Y_LOW}`,
    `C ${xOp + (xUt - xOp) * 0.55} ${Y_LOW}, ${xUt - (xUt - xOp) * 0.08} ${Y_LOW - (Y_LOW - Y_HIGH) * 0.35}, ${xUt} ${Y_HIGH}`,
    `L ${X1} ${Y_HIGH}`,
  ].join(' ')

  // U_NO: HIGH → první dotyk (konec RevT) → zákmity (BT) → LOW
  const lvl = (l: number) => Y_LOW - l * (Y_LOW - Y_HIGH)
  const noPts: string[] = [`${X0},${Y_HIGH}`, `${xNo},${Y_HIGH}`]
  for (const [f, l] of NO_BOUNCES) noPts.push(`${xNo + f * (xEnd - xNo)},${lvl(l)}`)
  noPts.push(`${xEnd},${Y_LOW}`, `${X1},${Y_LOW}`)

  // Dílky časové osy [ms] — kulatý krok
  const spanMs = (tMax - tMin) / 1000
  const rawStep = spanMs / 8
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const n = rawStep / mag
  const stepMs = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
  const ticks: number[] = []
  if (scaled) {
    for (let v = Math.ceil(tMin / 1000 / stepMs) * stepMs; v <= tMax / 1000 + 1e-9; v += stepMs) ticks.push(v)
  } else {
    // Zkrácená osa: rovnoměrné dílky by lhaly → dílky jen v okamžicích událostí
    for (const tUs of [tOp, tUt, tNo, tEnd]) if (!ticks.includes(tUs / 1000)) ticks.push(tUs / 1000)
  }
  const fmtTick = scaled
    ? (v: number) => (stepMs < 1 ? v.toFixed(stepMs < 0.1 ? 2 : 1) : v.toFixed(0))
    : (v: number) => {
        // Přesnost podle velikosti, ale tak, aby se sousední události lišily (426,55 / 426,75 ms)
        const round = (w: number, d: number) => (Math.round(w * 10 ** d) / 10 ** d).toFixed(d)   // 21.95.toFixed(1) = „21.9"
        let d = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0
        while (d < 2 && ticks.some(w => w !== v && round(w, d) === round(v, d))) d++
        return round(v, d)
      }

  const R1 = 290, R2 = 330, R3 = 380       // řady kót: UT + BT, RevT, OpT
  const dim = (xa: number, xb: number, y: number, key: string, fallback: string) => (
    <g opacity={h.op(key)}>
      {h.on(key) && <rect x={xa} y={y - 17} width={Math.max(0, xb - xa)} height={36} rx={4} fill={C_TIME} opacity={0.08} />}
      <line x1={xa + 2} y1={y} x2={xb - 2} y2={y} stroke={C_TIME} strokeWidth={h.sw(1.5, key)}
        markerEnd={`url(#${uid}tmG)`} markerStart={`url(#${uid}tmGL)`} />
      <text x={(xa + xb) / 2} y={y - 5} textAnchor="middle" fontSize={h.on(key) ? 12 : 10} fontWeight="700" fill={C_TIME}>
        {lbl(key, fallback)}
      </text>
      <text x={(xa + xb) / 2} y={y + 14} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {hasTimes ? `${val(key)} µs` : '—'}
      </text>
    </g>
  )
  // Úsek je „rozsvícený", patří-li k parametru (OpT rozsvítí všechny tři)
  const band = (key: string, base: number) => (h.active ? (h.on(key) ? Math.min(0.32, base * 2.4) : 0.04) : base)

  return (
    <svg className="rd-svg" viewBox="0 0 840 470" xmlns="http://www.w3.org/2000/svg"
      aria-label={t.chart.switchTimesAria}>
      <defs>
        <marker id={uid + 'tmG'}  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
        <marker id={uid + 'tmGL'} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
      </defs>

      {/* ── Mřížka + úrovně napětí ── */}
      {scaled && ticks.map(v => (
        <line key={`g${v}`} x1={x(v * 1000)} y1={Y_HIGH - 20} x2={x(v * 1000)} y2={Y_AXIS} stroke={C_GRID} strokeWidth={1} />
      ))}
      {[Y_HIGH, (Y_HIGH + Y_LOW) / 2, Y_LOW].map(y => (
        <line key={`h${y}`} x1={X0} y1={y} x2={X1} y2={y} stroke={C_GRID} strokeWidth={1} strokeDasharray="3,4" />
      ))}
      <text x={X0 - 8} y={Y_HIGH + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>10 V</text>
      <text x={X0 - 8} y={(Y_HIGH + Y_LOW) / 2 + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>5 V</text>
      <text x={X0 - 8} y={Y_LOW + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>0 V</text>

      {/* ── Barevné úseky UT / RevT / BT ── */}
      <rect x={xOp} y={Y_HIGH - 20} width={Math.max(0, xUt - xOp)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.ut}  opacity={band('ut_unstabletime', 0.14)} />
      <rect x={xUt} y={Y_HIGH - 20} width={Math.max(0, xNo - xUt)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.rev} opacity={band('rt_reversetime', 0.10)} />
      <rect x={xNo} y={Y_HIGH - 20} width={Math.max(0, xEnd - xNo)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.bt}  opacity={band('bt_bouncetime', 0.12)} />

      {/* ── Časová osa [ms], 0 = OP ── */}
      <line x1={X0} y1={Y_AXIS} x2={X1} y2={Y_AXIS} stroke={C_AXIS} strokeWidth={1.5} />
      {ticks.map(v => (
        <g key={`t${v}`}>
          <line x1={x(v * 1000)} y1={Y_AXIS} x2={x(v * 1000)} y2={Y_AXIS + 5} stroke={C_AXIS} />
          <text x={x(v * 1000)} y={Y_AXIS + 17} textAnchor="middle" fontSize={9} fill={C_AXIS}>{fmtTick(v)}</text>
        </g>
      ))}
      {/* Zkrácené úseky: značka přerušení osy „//" */}
      {compressed.map(([ta, tb]) => {
        const xm = (x(ta) + x(tb)) / 2
        return (
          <g key={`brk${ta}`} stroke={C_AXIS} strokeWidth={1.3}>
            <rect x={xm - 6} y={Y_AXIS - 4} width={12} height={8} fill="var(--color-surface, #fff)" stroke="none" />
            <line x1={xm - 7} y1={Y_AXIS + 5} x2={xm - 1} y2={Y_AXIS - 5} />
            <line x1={xm + 1} y1={Y_AXIS + 5} x2={xm + 7} y2={Y_AXIS - 5} />
          </g>
        )
      })}
      <text x={X1} y={Y_AXIS + 30} textAnchor="end" fontSize={10} fill={C_AXIS}>
        t [ms] · 0 = OP{scaled ? '' : ` · ${t.chart.switchTimesAxisCompressed}`}
      </text>

      {/* ── Události ── */}
      {[
        { xe: xOp,  label: 'OP',        color: '#43a047' },
        { xe: xNo,  label: 'NO ↓',      color: C_NO },
        { xe: xEnd, label: 'NO stable', color: C_NO },
      ].map((e, i, all) => {
        // Popisek blíž než 70 px k předchozímu (krátké UT / BT) → o řádek výš a doprava od čáry
        const lifted = i > 0 && e.xe - all[i - 1].xe < 70 ? 13 : 0
        return (
          <g key={e.label}>
            <line x1={e.xe} y1={Y_HIGH - 22 - lifted} x2={e.xe} y2={Y_AXIS} stroke={e.color} strokeWidth={1.2} strokeDasharray="4,3" />
            <text x={e.xe} y={Y_HIGH - 27 - lifted} textAnchor={lifted ? 'start' : 'middle'}
              fontSize={10} fontWeight="700" fill={e.color}>{e.label}</text>
          </g>
        )
      })}

      {/* ── Průběhy (kontext) ── */}
      <g opacity={h.active ? 0.7 : 1}>
        <path d={ncPath} fill="none" stroke={C_NC} strokeWidth={2.4} strokeLinejoin="round" />
        <polyline points={noPts.join(' ')} fill="none" stroke={C_NO} strokeWidth={2.2} strokeLinejoin="round" />
        <text x={X0 + 6} y={Y_LOW - 7} fontSize={11} fontWeight="700" fill={C_NC}>U_NC</text>
        <text x={X0 + 6} y={Y_HIGH - 7} fontSize={11} fontWeight="700" fill={C_NO}>U_NO</text>
      </g>

      {/* ── Kóty ── */}
      {dim(xOp, xUt, R1, 'ut_unstabletime', 'UT')}
      {dim(xNo, xEnd, R1, 'bt_bouncetime', 'BT')}
      {dim(xUt, xNo, R2, 'rt_reversetime', 'RevT')}
      {dim(xOp, xEnd, R3, 'ot_operatingtime', 'OpT')}
      {[xOp, xUt, xNo, xEnd].map((xe, i) => (
        <line key={`d${i}`} x1={xe} y1={Y_AXIS + 34} x2={xe} y2={R3 + 4} stroke={C_TIME} strokeWidth={0.8} strokeDasharray="2,3" opacity={0.6} />
      ))}

      {/* Legenda */}
      <line x1={X0} y1={435} x2={X0 + 25} y2={435} stroke={C_NC} strokeWidth={2.5} />
      <text x={X0 + 30} y={439} fontSize={10} fill={C_AXIS}>U_NC — NC (Normally Closed)</text>
      <line x1={X0 + 230} y1={435} x2={X0 + 255} y2={435} stroke={C_NO} strokeWidth={2.5} />
      <text x={X0 + 260} y={439} fontSize={10} fill={C_AXIS}>U_NO — NO (Normally Open)</text>
      <text x={X1} y={439} textAnchor="end" fontSize={9} fill={C_AXIS} opacity={0.8}>
        OpT = UT + RevT + BT
      </text>
    </svg>
  )
}
