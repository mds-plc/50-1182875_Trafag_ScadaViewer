/**
 * @file RecordDiagram.tsx
 * @description Detail záznamu:
 *   1. ForceTravelDiagram — hysterezní smyčka s kótami (screen 29)  viewBox 0 0 840 500
 *   2. TimeDiagram        — U_NC + U_NO při sepnutí (vzor: osciloskop IMG_4818), časy v měřítku   viewBox 0 0 840 470
 */

import { useState, useEffect, useId } from 'react'
import { PARAM_LABELS, PARAM_GROUPS, formatParam } from '../utils/paramMeta'
import ParamTable from './ParamTable'
import { useLang } from '../context/LangContext'

interface Props {
  record: Record<string, unknown>
}

/** Hodnota parametru pro zobrazení — sdílené formatParam (µm/µs celá čísla, N 2 des., mΩ, ∞). */
function makeVal(record: Record<string, unknown>) {
  return (key: string): string => formatParam(key, record[key]).text
}



// PARAM_GROUPS importováno z paramMeta.ts — sdíleno s ChartView TABLE_TABS

// ── Malá pomocná komponenta: popisný štítek bodu na křivce ──────────────────

function PointLabel({ x, y, label, value, dx = 8, dy = 0, anchor = 'start', color = '#374151' }: {
  x: number; y: number; label: string; value?: string
  dx?: number; dy?: number; anchor?: 'start' | 'middle' | 'end'; color?: string
}) {
  return (
    <g>
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
// viewBox: 0 0 840 500

function ForceTravelDiagram({ record }: Props) {
  const val = makeVal(record)
  const uid = useId()

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
  const AS = 7

  const C_RES    = '#7c3aed'
  const r_ncOpNeg = val('r_nc_operatingposition_neg')
  const r_ncOpPos = val('r_nc_operatingposition_pos')
  const r_noOpNeg = val('r_no_operatingposition_neg')
  const r_noOpPos = val('r_no_operatingposition_pos')
  const r_ncRpNeg = val('r_nc_releasingposition_neg')
  const r_ncRpPos = val('r_nc_releasingposition_pos')
  const r_noRpNeg = val('r_no_releasingposition_neg')
  const r_noRpPos = val('r_no_releasingposition_pos')


  return (
    <svg className="rd-svg" viewBox="0 0 840 500" xmlns="http://www.w3.org/2000/svg"
      aria-label="Force–Travel hysteresis diagram">
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
      <line x1={145} y1={380} x2={145} y2={22} stroke={C_AXIS} strokeWidth={1.5} />
      <polygon points={`145,22 ${145-AS/2},${22+AS*1.5} ${145+AS/2},${22+AS*1.5}`} fill={C_AXIS} />
      <text x={140} y={19} textAnchor="end" fontSize={11} fill={C_AXIS}>Force [N]</text>

      <line x1={135} y1={y_zero} x2={730} y2={y_zero} stroke={C_AXIS} strokeWidth={1.5} />
      <polygon points={`730,${y_zero} ${730-AS*1.5},${y_zero-AS/2} ${730-AS*1.5},${y_zero+AS/2}`}
        fill={C_AXIS} />
      <text x={736} y={y_zero+4} fontSize={11} fill={C_AXIS}>Travel [µm]</text>

      {/* ── Vodorovné referenční čáry sil (jemná mřížka) ── */}
      <line x1={148} y1={y_TTF} x2={TTP_x} y2={y_TTF} stroke={C_FORCE} strokeWidth={0.8} strokeDasharray="5,4" opacity={0.18} />
      <line x1={148} y1={y_OF}  x2={TTP_x} y2={y_OF}  stroke={C_FORCE} strokeWidth={0.8} strokeDasharray="5,4" opacity={0.18} />
      <line x1={148} y1={y_RF}  x2={TTP_x} y2={y_RF}  stroke={C_FORCE} strokeWidth={0.8} strokeDasharray="5,4" opacity={0.18} />

      {/* ── Mřížka: svislé přerušované čáry pozic ── */}
      {[FP_x, RP_x, OP_x, TTP_x].map(x => (
        <line key={x} x1={x} y1={30} x2={x} y2={y_zero}
          stroke={C_DASH} strokeWidth={1} strokeDasharray="5,4" />
      ))}

      {/* ══ HYSTEREZNÍ SMYČKA ══ */}
      {/* Přední cesta (lisování): A→B, B→C (skok), C→D */}
      <line x1={FP_x} y1={y_zero} x2={OP_x}  y2={y_OF}  stroke={C_FWD} strokeWidth={2.5} />
      <line x1={OP_x} y1={y_OF}   x2={OP_x}  y2={y_RF}  stroke={C_FWD} strokeWidth={2.5} />
      <line x1={OP_x} y1={y_RF}   x2={TTP_x} y2={y_TTF} stroke={C_FWD} strokeWidth={2.5} />

      {/* Zpětná cesta (uvolňování): D→E, E→F (skok), F→A — přerušovaná */}
      <line x1={TTP_x} y1={y_TTF}      x2={RP_x} y2={y_RP_return}
        stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
      <line x1={RP_x}  y1={y_RP_return} x2={RP_x} y2={y_RP_upper}
        stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
      <line x1={RP_x}  y1={y_RP_upper}  x2={FP_x} y2={y_zero}
        stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />

      {/* ── Uzlové body smyčky ── */}
      {/* A: FP (0,0) */}
      <circle cx={FP_x}  cy={y_zero}     r={5} fill="white" stroke={C_FWD} strokeWidth={2} />
      {/* B: OP / OF (skok dolů) */}
      <circle cx={OP_x}  cy={y_OF}       r={5} fill={C_FWD} />
      {/* C: OP / RF (po skoku) */}
      <circle cx={OP_x}  cy={y_RF}       r={5} fill={C_FWD} />
      {/* D: TTP / TTF */}
      <circle cx={TTP_x} cy={y_TTF}      r={5} fill={C_FWD} />
      {/* E: RP (zpětná, před skokem) */}
      <circle cx={RP_x}  cy={y_RP_return} r={5} fill="white" stroke={C_RET} strokeWidth={2} />
      {/* F: RP (zpětná, po skoku) */}
      <circle cx={RP_x}  cy={y_RP_upper}  r={5} fill="white" stroke={C_RET} strokeWidth={2} />

      {/* ── Kóty bodů — štítky přímo na křivce ── */}
      {/* A: FP */}
      <PointLabel x={FP_x} y={y_zero} label="FP" dx={8} dy={-14} color={C_FWD} />
      {/* B: OP = OF (horní skok) */}
      <PointLabel x={OP_x} y={y_OF}  label="OP / OF" value={val('of_operatingforce')}
        dx={10} dy={-6} color={C_FORCE} />
      {/* C: RP snap = RF (dolní skok) */}
      <PointLabel x={OP_x} y={y_RF}  label="RF" value={val('rf_realisingforce')}
        dx={10} dy={8} color={C_FORCE} />
      {/* D: TTP = TTF */}
      <PointLabel x={TTP_x} y={y_TTF} label="TTP / TTF" value={val('ttf_totaltravelforce')}
        dx={8} dy={-6} color={C_FORCE} />
      {/* E,F: RP zpětné cesty — jednoduchý text bez rect pozadí */}
      <text x={RP_x + 8} y={y_RP_upper  + 4} textAnchor="start" fontSize={8.5} fontWeight="700" fill={C_RET} opacity={0.8}>RP↑</text>
      <text x={RP_x + 8} y={y_RP_return + 13} textAnchor="start" fontSize={8.5} fontWeight="700" fill={C_RET} opacity={0.8}>RP↓</text>

      {/* ── Kóta silového diferenciálu ΔF u OP ── */}
      <line x1={OP_x+18} y1={y_OF+4}  x2={OP_x+18} y2={y_RF-4}
        stroke={C_FORCE} strokeWidth={1.2} markerEnd={`url(#${uid}dfA)`} markerStart={`url(#${uid}dfAR)`} />
      <text x={OP_x+24} y={(y_OF+y_RF)/2+4} fontSize={9} fill={C_FORCE} fontWeight="700">ΔF</text>

      {/* ── Silové kóty na Y-ose — 3 dvojité šipky (screen 29 styl) ── */}
      {/* TTF — x=30, nejdelší šipka (y_zero → y_TTF) */}
      <line x1={30} y1={y_zero - 5} x2={30} y2={y_TTF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd={`url(#${uid}ftF)`} markerStart={`url(#${uid}ftFR)`} />
      <text x={30} y={(y_zero + y_TTF) / 2}
        transform={`rotate(-90, 30, ${(y_zero + y_TTF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>TTF</text>
      <rect x={18} y={y_TTF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={30} y={y_TTF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('ttf_totaltravelforce')}</text>

      {/* OF — x=52 (y_zero → y_OF) */}
      <line x1={52} y1={y_zero - 5} x2={52} y2={y_OF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd={`url(#${uid}ftF)`} markerStart={`url(#${uid}ftFR)`} />
      <text x={52} y={(y_zero + y_OF) / 2}
        transform={`rotate(-90, 52, ${(y_zero + y_OF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>OF</text>
      <rect x={40} y={y_OF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={52} y={y_OF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('of_operatingforce')}</text>

      {/* RF — x=74 (y_zero → y_RF) */}
      <line x1={74} y1={y_zero - 5} x2={74} y2={y_RF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd={`url(#${uid}ftF)`} markerStart={`url(#${uid}ftFR)`} />
      <text x={74} y={(y_zero + y_RF) / 2}
        transform={`rotate(-90, 74, ${(y_zero + y_RF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>RF</text>
      <rect x={62} y={y_RF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={74} y={y_RF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('rf_realisingforce')}</text>

      {/* ΔF boční kóta na Y-ose (x=96) — diferenciál OF−RF */}
      <line x1={96} y1={y_OF + 4} x2={96} y2={y_RF - 4}
        stroke={C_FORCE} strokeWidth={1.2} markerEnd={`url(#${uid}dfA)`} markerStart={`url(#${uid}dfAR)`} />
      <text x={103} y={(y_OF + y_RF) / 2 + 4} textAnchor="start" fontSize={8} fontWeight="700" fill={C_FORCE}>ΔF</text>

      {/* ── Popisky pozic pod X-osou — posunuty dál od osy ── */}
      {([{ x: FP_x, l: 'FP' }, { x: RP_x, l: 'RP' }, { x: OP_x, l: 'OP' }, { x: TTP_x, l: 'TTP' }])
        .map(({ x, l }) => (
          <text key={l} x={x} y={y_zero+24} textAnchor="middle"
            fontSize={10} fontWeight="700" fill={C_AXIS}>{l}</text>
        ))}

      {/* ── Zdvihové kóty pod osou (modrá) — 4 řady dle screen 29 ── */}
      {/* Řada 1 (y=400): MD (RP→OP) — Differenzweg */}
      <line x1={RP_x+4} y1={400} x2={OP_x-4} y2={400}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(RP_x+OP_x)/2} y={397} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>MD</text>
      <text x={(RP_x+OP_x)/2} y={412} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('md_movementdifferential')}
      </text>

      {/* Řada 2 (y=425): PT (FP→OP) + OT (OP→TTP) — Vorlaufweg + Nachlaufweg */}
      <line x1={FP_x+4} y1={425} x2={OP_x-4} y2={425}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(FP_x+OP_x)/2} y={422} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>PT</text>
      <text x={(FP_x+OP_x)/2} y={437} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('pt_pretravel')}
      </text>
      <line x1={OP_x+4} y1={425} x2={TTP_x-4} y2={425}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(OP_x+TTP_x)/2} y={422} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>OT</text>
      <text x={(OP_x+TTP_x)/2} y={437} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('ot_overtravel')}
      </text>

      {/* Řada 3 (y=450): RT (RP→TTP) — Rücklaufweg. RT_RealisingTravel = TTP − RP (ověřeno na datech) */}
      <line x1={RP_x+4} y1={450} x2={TTP_x-4} y2={450}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(RP_x+TTP_x)/2} y={447} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>RT</text>
      <text x={(RP_x+TTP_x)/2} y={462} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('rt_realisingtravel')}
      </text>

      {/* Řada 4 (y=475): TT (FP→TTP) — Gesamtweg */}
      <line x1={FP_x+4} y1={475} x2={TTP_x-4} y2={475}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd={`url(#${uid}ftB)`} markerStart={`url(#${uid}ftBL)`} />
      <text x={(FP_x+TTP_x)/2} y={472} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>TT</text>
      <text x={(FP_x+TTP_x)/2} y={487} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('tt_totaltravel')}
      </text>

      {/* ── Odporové hodnoty RP [mΩ] — vlevo nahoře (fialová) ── */}
      <rect x={194} y={74} width={178} height={44} rx={4} fill="white" stroke={C_RES} strokeWidth={1} opacity={0.95} />
      <rect x={194} y={74} width={178} height={15} rx={4} fill={C_RES} opacity={0.13} />
      <text x={200} y={85} fontSize={9} fontWeight="700" fill={C_RES}>RP Contacts [mΩ]</text>
      {/* Řádek 1: NC */}
      <text x={200} y={99}  fontSize={8.5} fontWeight="700" fill={C_RES}>NC−</text>
      <text x={220} y={99}  fontSize={8.5} fill="#374151" fontFamily="monospace">{r_ncRpNeg}</text>
      <text x={284} y={99}  fontSize={8.5} fontWeight="700" fill={C_RES}>NC+</text>
      <text x={304} y={99}  fontSize={8.5} fill="#374151" fontFamily="monospace">{r_ncRpPos}</text>
      {/* Řádek 2: NO */}
      <text x={200} y={112} fontSize={8.5} fontWeight="700" fill={C_RES}>NO−</text>
      <text x={220} y={112} fontSize={8.5} fill="#374151" fontFamily="monospace">{r_noRpNeg}</text>
      <text x={284} y={112} fontSize={8.5} fontWeight="700" fill={C_RES}>NO+</text>
      <text x={304} y={112} fontSize={8.5} fill="#374151" fontFamily="monospace">{r_noRpPos}</text>
      {/* Connector: box → RP bod */}
      <line x1={283} y1={118} x2={RP_x} y2={y_RP_upper - 10}
        stroke={C_RES} strokeWidth={0.9} strokeDasharray="3,3" opacity={0.45} />

      {/* ── Odporové hodnoty OP [mΩ] — uprostřed nahoře (fialová) ── */}
      <rect x={420} y={74} width={178} height={44} rx={4} fill="white" stroke={C_RES} strokeWidth={1} opacity={0.95} />
      <rect x={420} y={74} width={178} height={15} rx={4} fill={C_RES} opacity={0.13} />
      <text x={426} y={85} fontSize={9} fontWeight="700" fill={C_RES}>OP Contacts [mΩ]</text>
      {/* Řádek 1: NC */}
      <text x={426} y={99}  fontSize={8.5} fontWeight="700" fill={C_RES}>NC−</text>
      <text x={446} y={99}  fontSize={8.5} fill="#374151" fontFamily="monospace">{r_ncOpNeg}</text>
      <text x={510} y={99}  fontSize={8.5} fontWeight="700" fill={C_RES}>NC+</text>
      <text x={530} y={99}  fontSize={8.5} fill="#374151" fontFamily="monospace">{r_ncOpPos}</text>
      {/* Řádek 2: NO */}
      <text x={426} y={112} fontSize={8.5} fontWeight="700" fill={C_RES}>NO−</text>
      <text x={446} y={112} fontSize={8.5} fill="#374151" fontFamily="monospace">{r_noOpNeg}</text>
      <text x={510} y={112} fontSize={8.5} fontWeight="700" fill={C_RES}>NO+</text>
      <text x={530} y={112} fontSize={8.5} fill="#374151" fontFamily="monospace">{r_noOpPos}</text>
      {/* Connector: box → OP bod */}
      <line x1={509} y1={118} x2={OP_x} y2={y_OF - 10}
        stroke={C_RES} strokeWidth={0.9} strokeDasharray="3,3" opacity={0.45} />

      {/* Legenda */}
      <line x1={710} y1={160} x2={742} y2={160} stroke={C_FWD} strokeWidth={2.5} />
      <text x={747} y={164} fontSize={10} fill="#64748b">Forward</text>
      <line x1={710} y1={178} x2={742} y2={178} stroke={C_RET} strokeWidth={2} strokeDasharray="8,5" />
      <text x={747} y={182} fontSize={10} fill="#64748b">Return</text>
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
//
// viewBox: 0 0 840 470

/** Zákmity NO během BT: [podíl šířky BT, úroveň 0 = LOW … 1 = HIGH] — schematický tvar. */
const NO_BOUNCES: [number, number][] = [
  [0.00, 0], [0.10, 0], [0.10, 1], [0.18, 1], [0.18, 0], [0.30, 0], [0.30, 0.85], [0.36, 0.85],
  [0.36, 0], [0.46, 0], [0.46, 1], [0.50, 1], [0.50, 0], [0.78, 0], [0.78, 0.6], [0.81, 0.6], [0.81, 0],
]

function TimeDiagram({ record }: Props) {
  const val = makeVal(record)
  const uid = useId()

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
  const x = (tUs: number) => X0 + ((tUs - tMin) / (tMax - tMin)) * (X1 - X0)

  const tOp = 0, tUt = UT, tNo = UT + REV, tEnd = OPT
  const xOp = x(tOp), xUt = x(tUt), xNo = x(tNo), xEnd = x(tEnd)

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
  for (let v = Math.ceil(tMin / 1000 / stepMs) * stepMs; v <= tMax / 1000 + 1e-9; v += stepMs) ticks.push(v)
  const fmtTick = (v: number) => (stepMs < 1 ? v.toFixed(stepMs < 0.1 ? 2 : 1) : v.toFixed(0))

  const R1 = 290, R2 = 330, R3 = 380       // řady kót: UT + BT, RevT, OpT
  const arrow = (xa: number, xb: number, y: number) => (
    <line x1={xa + 2} y1={y} x2={xb - 2} y2={y} stroke={C_TIME} strokeWidth={1.5}
      markerEnd={`url(#${uid}tmG)`} markerStart={`url(#${uid}tmGL)`} />
  )
  const dim = (xa: number, xb: number, y: number, label: string, key: string) => (
    <g>
      {arrow(xa, xb, y)}
      <text x={(xa + xb) / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight="700" fill={C_TIME}>{label}</text>
      <text x={(xa + xb) / 2} y={y + 14} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {hasTimes ? `${val(key)} µs` : '—'}
      </text>
    </g>
  )

  return (
    <svg className="rd-svg" viewBox="0 0 840 470" xmlns="http://www.w3.org/2000/svg"
      aria-label="Contact switching times — U_NC and U_NO voltage">
      <defs>
        <marker id={uid + 'tmG'}  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
        <marker id={uid + 'tmGL'} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
      </defs>

      {/* ── Mřížka + úrovně napětí ── */}
      {ticks.map(v => (
        <line key={`g${v}`} x1={x(v * 1000)} y1={Y_HIGH - 20} x2={x(v * 1000)} y2={Y_AXIS} stroke={C_GRID} strokeWidth={1} />
      ))}
      {[Y_HIGH, (Y_HIGH + Y_LOW) / 2, Y_LOW].map(y => (
        <line key={`h${y}`} x1={X0} y1={y} x2={X1} y2={y} stroke={C_GRID} strokeWidth={1} strokeDasharray="3,4" />
      ))}
      <text x={X0 - 8} y={Y_HIGH + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>10 V</text>
      <text x={X0 - 8} y={(Y_HIGH + Y_LOW) / 2 + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>5 V</text>
      <text x={X0 - 8} y={Y_LOW + 4} textAnchor="end" fontSize={10} fill={C_AXIS}>0 V</text>

      {/* ── Barevné úseky UT / RevT / BT ── */}
      <rect x={xOp} y={Y_HIGH - 20} width={Math.max(0, xUt - xOp)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.ut}  opacity={0.14} />
      <rect x={xUt} y={Y_HIGH - 20} width={Math.max(0, xNo - xUt)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.rev} opacity={0.10} />
      <rect x={xNo} y={Y_HIGH - 20} width={Math.max(0, xEnd - xNo)} height={Y_AXIS - Y_HIGH + 20} fill={BAND.bt}  opacity={0.12} />

      {/* ── Časová osa [ms], 0 = OP ── */}
      <line x1={X0} y1={Y_AXIS} x2={X1} y2={Y_AXIS} stroke={C_AXIS} strokeWidth={1.5} />
      {ticks.map(v => (
        <g key={`t${v}`}>
          <line x1={x(v * 1000)} y1={Y_AXIS} x2={x(v * 1000)} y2={Y_AXIS + 5} stroke={C_AXIS} />
          <text x={x(v * 1000)} y={Y_AXIS + 17} textAnchor="middle" fontSize={9} fill={C_AXIS}>{fmtTick(v)}</text>
        </g>
      ))}
      <text x={X1} y={Y_AXIS + 30} textAnchor="end" fontSize={10} fill={C_AXIS}>t [ms] · 0 = OP</text>

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

      {/* ── Průběhy ── */}
      <path d={ncPath} fill="none" stroke={C_NC} strokeWidth={2.4} strokeLinejoin="round" />
      <polyline points={noPts.join(' ')} fill="none" stroke={C_NO} strokeWidth={2.2} strokeLinejoin="round" />
      <text x={X0 + 6} y={Y_LOW - 7} fontSize={11} fontWeight="700" fill={C_NC}>U_NC</text>
      <text x={X0 + 6} y={Y_HIGH - 7} fontSize={11} fontWeight="700" fill={C_NO}>U_NO</text>

      {/* ── Kóty ── */}
      {dim(xOp, xUt, R1, PARAM_LABELS.ut_unstabletime ?? 'UT', 'ut_unstabletime')}
      {dim(xNo, xEnd, R1, PARAM_LABELS.bt_bouncetime ?? 'BT', 'bt_bouncetime')}
      {dim(xUt, xNo, R2, PARAM_LABELS.rt_reversetime ?? 'RevT', 'rt_reversetime')}
      {dim(xOp, xEnd, R3, PARAM_LABELS.ot_operatingtime ?? 'OpT', 'ot_operatingtime')}
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

// ── Tabulka parametrů ─────────────────────────────────────────────────────────


// ── NOK info panel ───────────────────────────────────────────────────────────

const NOK_CATEGORIES = [
  { key: 'nokcategory_force',    label: 'Force' },
  { key: 'nokcategory_position', label: 'Position' },
  { key: 'nokcategory_electric', label: 'Electric' },
  { key: 'nokcategory_times',    label: 'Times' },
  { key: 'nokcategory_process',  label: 'Process' },
] as const

function NokPanel({ record }: Props) {
  // Zobrazit panel jen pokud existuje alespoň jedno nokcategory_* pole
  const hasAny = NOK_CATEGORIES.some(c => record[c.key] != null && String(record[c.key] ?? '') !== '')
  if (!hasAny) return null

  return (
    <div className="rd-nok-panel">
      <span className="rd-nok-panel__title">NOK Categories</span>
      <span className="rd-nok-panel__cats">
        {NOK_CATEGORIES.map(c => {
          const isFail = String(record[c.key]) === '1'
          return (
            <span key={c.key} className={`rd-nok-panel__cat rd-nok-panel__cat--${isFail ? 'fail' : 'ok'}`}>
              <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>
                {isFail ? '!' : '\u2713'}
              </span>
              {c.label}
            </span>
          )
        })}
      </span>
    </div>
  )
}

// ── Default export ────────────────────────────────────────────────────────────

// Ikona rozbalení (expand arrows)
function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <polyline points="9,1 13,1 13,5" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <line x1="8" y1="6" x2="13" y2="1" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" />
      <polyline points="5,13 1,13 1,9" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <line x1="6" y1="8" x2="1" y2="13" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" />
    </svg>
  )
}

export default function RecordDiagram({ record }: Props) {
  const { t } = useLang()
  const [maximized, setMaximized] = useState<'force' | 'time' | null>(null)

  // Zavřít modal na Escape
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  const TITLE_FORCE = t.chart.diagramForceTravel
  const TITLE_TIME  = t.chart.diagramSwitchingTimes

  return (
    <>
      <div className="rd-diagrams mb-4">
        <div className="tile">
          <div className="tile__header">
            <span className="tile__title">{TITLE_FORCE}</span>
            <div className="tile__header-actions">
              <button className="rd-maximize-btn" onClick={() => setMaximized('force')}
                title={t.chart.maximize} aria-label={t.chart.maximize}>
                <ExpandIcon />
              </button>
            </div>
          </div>
          <ForceTravelDiagram record={record} />
        </div>
        <div className="tile">
          <div className="tile__header">
            <span className="tile__title">{TITLE_TIME}</span>
            <div className="tile__header-actions">
              <button className="rd-maximize-btn" onClick={() => setMaximized('time')}
                title={t.chart.maximize} aria-label={t.chart.maximize}>
                <ExpandIcon />
              </button>
            </div>
          </div>
          <TimeDiagram record={record} />
        </div>
      </div>

      <NokPanel record={record} />
      <ParamTable record={record} groups={PARAM_GROUPS} title={t.chart.paramsTitle} />

      {/* Modální overlay — maximalizovaný diagram */}
      {maximized && (
        <div className="rd-modal-overlay" onClick={() => setMaximized(null)}
          role="dialog" aria-modal="true">
          <div className="rd-modal-content" onClick={e => e.stopPropagation()}>
            <div className="rd-modal-header">
              <span className="rd-modal-title">
                {maximized === 'force' ? TITLE_FORCE : TITLE_TIME}
              </span>
              <button className="rd-modal-close" onClick={() => setMaximized(null)}
                aria-label="Close">×</button>
            </div>
            {maximized === 'force'
              ? <ForceTravelDiagram record={record} />
              : <TimeDiagram record={record} />
            }
          </div>
        </div>
      )}
    </>
  )
}
