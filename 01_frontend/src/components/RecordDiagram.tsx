/**
 * @file RecordDiagram.tsx
 * @description Detail záznamu:
 *   1. ForceTravelDiagram — hysterezní smyčka s kótami (screen 29)  viewBox 0 0 840 500
 *   2. TimeDiagram        — průběhy NC + NO kontaktu (screen 30)   viewBox 0 0 840 470
 */

import React, { useState, useEffect } from 'react'
import { PARAM_LABELS, PARAM_TOOLTIPS, PARAM_GROUPS } from '../utils/paramMeta'
import { useLang } from '../context/LangContext'

interface Props {
  record: Record<string, unknown>
}

function makeVal(record: Record<string, unknown>) {
  return (key: string): string => {
    const raw = record[key]
    if (raw == null || String(raw).trim() === '') return '—'
    const n = Number(raw)
    return isNaN(n) ? String(raw) : n.toFixed(2)
  }
}

function getUnit(key: string): string {
  return PARAM_TOOLTIPS[key]?.match(/\[([^\]]+)\]$/)?.[1] ?? ''
}

// ── České popisy parametrů ──────────────────────────────────────────────────

const PARAM_DESC: Record<string, string> = {
  of_operatingforce:
    'Síla [N] v bodě sepnutí (OP). Pokud je příliš velká nebo malá, spínač neodpovídá specifikaci.',
  rf_realisingforce:
    'Síla [N] při uvolnění kontaktu na zpáteční cestě (RP). Spolu s OF definuje silovou hysterezi.',
  ttf_totaltravelforce:
    'Maximální síla [N] na konci zdvihu (TTP). Nesmí překročit povolenou mez pro daný typ.',
  fp_freeposition:
    'Výchozí poloha kladky [mm] bez vnější síly — referenční bod pro všechny délkové hodnoty.',
  op_operatingposition:
    'Vzdálenost [mm] od FP do bodu sepnutí kontaktu (aktivace NC→NO).',
  rp_realeasingposition:
    'Vzdálenost [mm] od FP do bodu uvolnění kontaktu při zpáteční cestě (deaktivace NO→NC).',
  ttp_totaltravelposition:
    'Maximální bezpečná vzdálenost stisku [mm]. Za tímto bodem hrozí mechanické poškození.',
  pt_pretravel:
    'Předzdvih [mm] — dráha od FP do OP. Musí být dostatečná pro spolehlivé sepnutí.',
  ot_overtravel:
    'Přezdvih [mm] — rezerva za bodem sepnutí (OP→TTP). Chrání kontakt před přetížením.',
  rt_realisingtravel:
    'Uvolňovací zdvih [mm] — vzdálenost uvolnění kontaktu od RP.',
  md_movementdifferential:
    'Diferenciál pohybu [mm] — vzdálenost mezi OP a RP (polohovová hystereze). Větší MD = stabilnější přepínání.',
  tt_totaltravel:
    'Celkový zdvih [mm] — vzdálenost od FP do TTP.',
  ut_unstabletime:
    'Nestabilní čas [ms] — délka kmitů kontaktu těsně po sepnutí, než se kontakt definitivně otevře.',
  rt_reversetime:
    'Čas reverzu [ms] — okno, ve kterém kontakt dočasně reverzuje zpět k zavřenému stavu (NC se krátce uzavře).',
  bt_bouncetime:
    'Čas odskoku [ms] — celková délka zákmitů po sepnutí. Delší BT = více šumu, pomalejší odezva.',
  ot_operatingtime:
    'Čas sepnutí [ms] — celková doba od zahájení spínání po ustálení kontaktu v novém stavu.',
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
}

// PARAM_GROUPS importováno z paramMeta.ts — sdíleno s ChartView TABLE_TABS

// ── Malá pomocná komponenta: popisný štítek bodu na křivce ──────────────────

function PointLabel({ x, y, label, value, dx = 8, dy = 0, anchor = 'start', color = '#374151' }: {
  x: number; y: number; label: string; value?: string
  dx?: number; dy?: number; anchor?: string; color?: string
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

  // RL = TTP − RP (odvozený parametr, není přímo v CSV)
  const rl_str = (() => {
    const ttp = Number(record['ttp_totaltravelposition'])
    const rp  = Number(record['rp_realeasingposition'])
    if (isNaN(ttp) || isNaN(rp)) return '—'
    return (ttp - rp).toFixed(2)
  })()

  return (
    <svg className="rd-svg" viewBox="0 0 840 500" xmlns="http://www.w3.org/2000/svg"
      aria-label="Force–Travel hysteresis diagram">
      <defs>
        <marker id="ftB"  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TRAVEL} /></marker>
        <marker id="ftBL" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TRAVEL} /></marker>
        <marker id="ftF"  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_FORCE} /></marker>
        <marker id="ftFR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_FORCE} /></marker>
        <marker id="dfA"  markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={C_FORCE} /></marker>
        <marker id="dfAR" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto-start-reverse">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={C_FORCE} /></marker>
      </defs>

      {/* ── Osy ── */}
      <line x1={145} y1={380} x2={145} y2={22} stroke={C_AXIS} strokeWidth={1.5} />
      <polygon points={`145,22 ${145-AS/2},${22+AS*1.5} ${145+AS/2},${22+AS*1.5}`} fill={C_AXIS} />
      <text x={140} y={19} textAnchor="end" fontSize={11} fill={C_AXIS}>Force [N]</text>

      <line x1={135} y1={y_zero} x2={730} y2={y_zero} stroke={C_AXIS} strokeWidth={1.5} />
      <polygon points={`730,${y_zero} ${730-AS*1.5},${y_zero-AS/2} ${730-AS*1.5},${y_zero+AS/2}`}
        fill={C_AXIS} />
      <text x={736} y={y_zero+4} fontSize={11} fill={C_AXIS}>Travel [mm]</text>

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
        stroke={C_FORCE} strokeWidth={1.2} markerEnd="url(#dfA)" markerStart="url(#dfAR)" />
      <text x={OP_x+24} y={(y_OF+y_RF)/2+4} fontSize={9} fill={C_FORCE} fontWeight="700">ΔF</text>

      {/* ── Silové kóty na Y-ose — 3 dvojité šipky (screen 29 styl) ── */}
      {/* TTF — x=30, nejdelší šipka (y_zero → y_TTF) */}
      <line x1={30} y1={y_zero - 5} x2={30} y2={y_TTF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd="url(#ftF)" markerStart="url(#ftFR)" />
      <text x={30} y={(y_zero + y_TTF) / 2}
        transform={`rotate(-90, 30, ${(y_zero + y_TTF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>TTF</text>
      <rect x={18} y={y_TTF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={30} y={y_TTF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('ttf_totaltravelforce')}</text>

      {/* OF — x=52 (y_zero → y_OF) */}
      <line x1={52} y1={y_zero - 5} x2={52} y2={y_OF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd="url(#ftF)" markerStart="url(#ftFR)" />
      <text x={52} y={(y_zero + y_OF) / 2}
        transform={`rotate(-90, 52, ${(y_zero + y_OF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>OF</text>
      <rect x={40} y={y_OF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={52} y={y_OF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('of_operatingforce')}</text>

      {/* RF — x=74 (y_zero → y_RF) */}
      <line x1={74} y1={y_zero - 5} x2={74} y2={y_RF + 5}
        stroke={C_FORCE} strokeWidth={1.5} markerEnd="url(#ftF)" markerStart="url(#ftFR)" />
      <text x={74} y={(y_zero + y_RF) / 2}
        transform={`rotate(-90, 74, ${(y_zero + y_RF) / 2})`}
        dy="-8" textAnchor="middle" fontSize={8} fontWeight="700" fill={C_FORCE}>RF</text>
      <rect x={62} y={y_RF - 15} width={24} height={13} rx={2} fill={C_FORCE} opacity={0.15} />
      <text x={74} y={y_RF - 5} textAnchor="middle" fontSize={8} fill={C_FORCE} fontFamily="monospace">{val('rf_realisingforce')}</text>

      {/* ΔF boční kóta na Y-ose (x=96) — diferenciál OF−RF */}
      <line x1={96} y1={y_OF + 4} x2={96} y2={y_RF - 4}
        stroke={C_FORCE} strokeWidth={1.2} markerEnd="url(#dfA)" markerStart="url(#dfAR)" />
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
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
      <text x={(RP_x+OP_x)/2} y={397} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>MD</text>
      <text x={(RP_x+OP_x)/2} y={412} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('md_movementdifferential')}
      </text>

      {/* Řada 2 (y=425): PT (FP→OP) + OT (OP→TTP) — Vorlaufweg + Nachlaufweg */}
      <line x1={FP_x+4} y1={425} x2={OP_x-4} y2={425}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
      <text x={(FP_x+OP_x)/2} y={422} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>PT</text>
      <text x={(FP_x+OP_x)/2} y={437} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('pt_pretravel')}
      </text>
      <line x1={OP_x+4} y1={425} x2={TTP_x-4} y2={425}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
      <text x={(OP_x+TTP_x)/2} y={422} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>OT</text>
      <text x={(OP_x+TTP_x)/2} y={437} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('ot_overtravel')}
      </text>

      {/* Řada 3 (y=450): RT (FP→RP) + RL (RP→TTP) — Leerlaufweg + Rücklaufweg */}
      <line x1={FP_x+4} y1={450} x2={RP_x-4} y2={450}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
      <text x={(FP_x+RP_x)/2} y={447} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>RT</text>
      <text x={(FP_x+RP_x)/2} y={462} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {val('rt_realisingtravel')}
      </text>
      <line x1={RP_x+4} y1={450} x2={TTP_x-4} y2={450}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
      <text x={(RP_x+TTP_x)/2} y={447} textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TRAVEL}>RL</text>
      <text x={(RP_x+TTP_x)/2} y={462} textAnchor="middle" fontSize={9} fill={C_TRAVEL} fontFamily="monospace">
        {rl_str}
      </text>

      {/* Řada 4 (y=475): TT (FP→TTP) — Gesamtweg */}
      <line x1={FP_x+4} y1={475} x2={TTP_x-4} y2={475}
        stroke={C_TRAVEL} strokeWidth={1.5} markerEnd="url(#ftB)" markerStart="url(#ftBL)" />
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

// ── Diagram 2: NC + NO průběh spínání (screen 30) ────────────────────────────
//
// FYZIKÁLNÍ REALITA:
//   NC (Normally Closed) = před spínáním ZAVŘEN → při stisku se OTEVÍRÁ → HIGH padá DOLŮ
//   NO (Normally Open)   = před spínáním OTEVŘEN → při stisku se ZAVÍRÁ → LOW stoupá NAHORU
//
// LAYOUT: každý kontakt má vlastní oblast HIGH(top) → LOW(bottom).
//   NC oblast: y=[NC_HIGH=55, NC_LOW=140]  — HIGH nahoře, LOW dole
//   NO oblast: y=[NO_HIGH=182, NO_LOW=267] — HIGH nahoře, LOW dole (níže na SVG)
//
// ZRCADLOVÁ KOMPLEMENTARITA: NO_y = MIRROR - NC_y, kde MIRROR = NC_HIGH + NO_LOW = 322
//   → NC na HIGH (55)  ↔ NO na LOW  (267)  = NC zavřen, NO otevřen ✓
//   → NC na LOW  (140) ↔ NO na HIGH (182)  = NC otevřen, NO zavřen ✓
//   → NC padá DOLŮ při spínání ↔ NO stoupá NAHORU — opačný vizuální směr ✓
//
// viewBox: 0 0 840 470

function TimeDiagram({ record }: Props) {
  const val = makeVal(record)

  const C_NC   = '#1e293b'
  const C_NO   = '#2563eb'
  const C_TIME = '#059669'
  const C_AXIS = '#6b7280'
  const C_DASH = '#e2e8f0'
  const AS = 7

  // NC oblast (horní): HIGH = zavřen, LOW = otevřen
  const NC_HIGH = 55
  const NC_LOW  = 140

  // NO oblast (dolní): HIGH = zavřen, LOW = otevřen
  const NO_HIGH = 182
  const NO_LOW  = 267

  // Zrcadlový vzorec: NO_y = MIRROR - NC_y
  const MIRROR = NC_HIGH + NO_LOW   // 55 + 267 = 322

  // Časové body
  const t0     = 125
  const t_act  = 285
  const t_ut   = 340
  const t_revt = 390
  const t_bt   = 488
  const t_opt  = 568

  // NC waveform: CLOSED/HIGH → (switch) → OPEN/LOW + zákmity + reverz
  const ncPts: [number, number][] = [
    [t0,         NC_HIGH],
    [t_act,      NC_HIGH],
    [t_act,      NC_LOW],    // okamžité otevření ↓
    [310,        92],        // zákmit 1: NC se krátce uzavře (↑ k HIGH)
    [322,        NC_LOW],
    [332,        102],       // zákmit 2: menší
    [t_ut,       NC_LOW],
    [365,        58],        // REVERZ: plné uzavření (≈ NC_HIGH)
    [t_revt,     NC_LOW],   // znovu otevřen
    [418,        118],       // zákmit 3: po reverzu
    [438,        NC_LOW],
    [456,        126],
    [472,        NC_LOW],
    [480,        136],       // poslední zákmit, téměř neznatelný
    [t_bt,       NC_LOW],
    [t_opt + 80, NC_LOW],
  ]

  // NO waveform = zrcadlový obraz NC:
  //   NC HIGH (zavřen)  → NO LOW  (otevřen)
  //   NC LOW  (otevřen) → NO HIGH (zavřen)
  //   NC ↓ → NO ↑  (opačné vizuální směry = fyzikálně správně)
  const noPts: [number, number][] = ncPts.map(([x, y]) => [x, MIRROR - y])

  const toPoints = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

  // X-osa a časové šipky
  const X_AXIS = 290
  const R1 = 308   // UT + RevT
  const R2 = 346   // BT
  const R3 = 384   // OpT

  return (
    <svg className="rd-svg" viewBox="0 0 840 470" xmlns="http://www.w3.org/2000/svg"
      aria-label="Contact switching time — NC and NO signals">
      <defs>
        <marker id="tmG"  markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
        <marker id="tmGL" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
          <path d="M0,0 L6,3 L0,6 Z" fill={C_TIME} /></marker>
      </defs>

      {/* ── Referenční přerušované čáry HIGH / LOW ── */}
      <line x1={108} y1={NC_HIGH} x2={715} y2={NC_HIGH} stroke={C_DASH} strokeWidth={1} strokeDasharray="3,4" />
      <line x1={108} y1={NC_LOW}  x2={715} y2={NC_LOW}  stroke={C_DASH} strokeWidth={1} strokeDasharray="3,4" />
      <line x1={108} y1={NO_HIGH} x2={715} y2={NO_HIGH} stroke={C_DASH} strokeWidth={1} strokeDasharray="3,4" />
      <line x1={108} y1={NO_LOW}  x2={715} y2={NO_LOW}  stroke={C_DASH} strokeWidth={1} strokeDasharray="3,4" />

      {/* ── X-osa (čas) ── */}
      <line x1={108} y1={X_AXIS} x2={715} y2={X_AXIS} stroke={C_AXIS} strokeWidth={1.5} />
      <polygon points={`715,${X_AXIS} ${715-AS*1.5},${X_AXIS-AS/2} ${715-AS*1.5},${X_AXIS+AS/2}`}
        fill={C_AXIS} />
      <text x={720} y={X_AXIS+4} fontSize={11} fill={C_AXIS}>Time [ms]</text>

      {/* ── Svislé referenční čáry klíčových časů ── */}
      {[t_act, t_ut, t_revt, t_bt, t_opt].map(x => (
        <line key={x} x1={x} y1={35} x2={x} y2={X_AXIS}
          stroke={C_DASH} strokeWidth={1} strokeDasharray="4,4" />
      ))}

      {/* ── Popisky kanálů a úrovní ── */}
      <text x={104} y={(NC_HIGH+NC_LOW)/2+4} textAnchor="end" fontSize={11} fontWeight="700" fill={C_NC}>NC</text>
      <text x={104} y={NC_HIGH+4} textAnchor="end" fontSize={9} fill={C_NC} opacity={0.6}>HIGH</text>
      <text x={104} y={NC_LOW+4}  textAnchor="end" fontSize={9} fill={C_NC} opacity={0.6}>LOW</text>

      <text x={104} y={(NO_HIGH+NO_LOW)/2+4} textAnchor="end" fontSize={11} fontWeight="700" fill={C_NO}>NO</text>
      <text x={104} y={NO_HIGH+4} textAnchor="end" fontSize={9} fill={C_NO} opacity={0.6}>HIGH</text>
      <text x={104} y={NO_LOW+4}  textAnchor="end" fontSize={9} fill={C_NO} opacity={0.6}>LOW</text>

      {/* ── Zónové popisky ── */}
      <text x={(t_act+t_ut)/2}  y={42} textAnchor="middle" fontSize={9} fill="#64748b">Unstable</text>
      <text x={(t_ut+t_revt)/2} y={42} textAnchor="middle" fontSize={9} fill="#64748b">Reverse</text>
      <text x={(t_revt+t_bt)/2} y={42} textAnchor="middle" fontSize={9} fill="#64748b">Bounce</text>

      {/* ── NC signál ── */}
      <polyline points={toPoints(ncPts)} fill="none" stroke={C_NC} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* ── NO signál (zrcadlový — opačný směr) ── */}
      <polyline points={toPoints(noPts)} fill="none" stroke={C_NO} strokeWidth={2.5}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* ── Časové šipky ── */}
      {/* UT: t_act → t_ut */}
      <line x1={t_act+4} y1={R1} x2={t_ut-4} y2={R1}
        stroke={C_TIME} strokeWidth={1.5} markerEnd="url(#tmG)" markerStart="url(#tmGL)" />
      <text x={(t_act+t_ut)/2} y={R1-4}  textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TIME}>UT</text>
      <text x={(t_act+t_ut)/2} y={R1+13} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {val('ut_unstabletime')}
      </text>
      {/* RevT: t_ut → t_revt */}
      <line x1={t_ut+4} y1={R1} x2={t_revt-4} y2={R1}
        stroke={C_TIME} strokeWidth={1.5} markerEnd="url(#tmG)" markerStart="url(#tmGL)" />
      <text x={(t_ut+t_revt)/2} y={R1-4}  textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TIME}>RevT</text>
      <text x={(t_ut+t_revt)/2} y={R1+13} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {val('rt_reversetime')}
      </text>
      {/* BT: t_act → t_bt */}
      <line x1={t_act+4} y1={R2} x2={t_bt-4} y2={R2}
        stroke={C_TIME} strokeWidth={1.5} markerEnd="url(#tmG)" markerStart="url(#tmGL)" />
      <text x={(t_act+t_bt)/2} y={R2-4}  textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TIME}>BT</text>
      <text x={(t_act+t_bt)/2} y={R2+13} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {val('bt_bouncetime')}
      </text>
      {/* OpT: t_act → t_opt */}
      <line x1={t_act+4} y1={R3} x2={t_opt-4} y2={R3}
        stroke={C_TIME} strokeWidth={1.5} markerEnd="url(#tmG)" markerStart="url(#tmGL)" />
      <text x={(t_act+t_opt)/2} y={R3-4}  textAnchor="middle" fontSize={9} fontWeight="700" fill={C_TIME}>OpT</text>
      <text x={(t_act+t_opt)/2} y={R3+13} textAnchor="middle" fontSize={10} fill={C_TIME} fontFamily="monospace">
        {val('ot_operatingtime')}
      </text>

      {/* Legenda */}
      <line x1={580} y1={435} x2={605} y2={435} stroke={C_NC} strokeWidth={2.5} />
      <text x={610} y={439} fontSize={10} fill={C_AXIS}>NC (Normally Closed)</text>
      <line x1={580} y1={453} x2={605} y2={453} stroke={C_NO} strokeWidth={2.5} />
      <text x={610} y={457} fontSize={10} fill={C_AXIS}>NO (Normally Open)</text>
    </svg>
  )
}

// ── Tabulka parametrů ─────────────────────────────────────────────────────────

function ParamTable({ record }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const { t } = useLang()
  const val = makeVal(record)

  return (
    <div className="tile tile--12">
      <div className="tile__header">
        <span className="tile__title">{t.chart.paramsTitle}</span>
      </div>
      <table className="rd-pt">
        <thead>
          <tr>
            <th className="rd-pt__th rd-pt__th--abbr">{t.chart.paramAbbr}</th>
            <th className="rd-pt__th rd-pt__th--name">{t.chart.paramName}</th>
            <th className="rd-pt__th rd-pt__th--val">{t.chart.paramValue}</th>
            <th className="rd-pt__th rd-pt__th--help"></th>
          </tr>
        </thead>
        <tbody>
          {PARAM_GROUPS.map(group => (
            <React.Fragment key={group.label}>
              <tr className="rd-pt__group-row">
                <td colSpan={4} className="rd-pt__group-header"
                  style={{ borderLeftColor: group.color }}>
                  <span style={{ color: group.color }}>{group.label} [{group.unit}]</span>
                </td>
              </tr>
              {group.keys.map(k => {
                const v      = val(k)
                const missing = v === '—'
                const isOpen  = expandedKey === k
                const u       = getUnit(k)
                const name    = (PARAM_TOOLTIPS[k] ?? PARAM_LABELS[k] ?? k)
                  .replace(/\s*\[.*?\]\s*$/, '')
                const desc    = PARAM_DESC[k]
                return (
                  <React.Fragment key={k}>
                    <tr className={`rd-pt__row${missing ? ' rd-pt__row--missing' : ''}`}>
                      <td className="rd-pt__abbr" style={{ color: group.color }}>
                        {PARAM_LABELS[k] ?? k}
                      </td>
                      <td className="rd-pt__name">{name}</td>
                      <td className="rd-pt__val">
                        {missing ? '—' : <>{v}{u && <span className="rd-pt__unit">{u}</span>}</>}
                      </td>
                      <td className="rd-pt__help-cell">
                        {desc && (
                          <button
                            className={`rd-pt__help-btn${isOpen ? ' rd-pt__help-btn--active' : ''}`}
                            onClick={() => setExpandedKey(isOpen ? null : k)}
                            aria-expanded={isOpen}
                          >?</button>
                        )}
                      </td>
                    </tr>
                    {isOpen && desc && (
                      <tr className="rd-pt__desc-row">
                        <td colSpan={4} className="rd-pt__desc">{desc}</td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
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

  const TITLE_FORCE = 'Force – Travel'
  const TITLE_TIME  = 'Contact Switching Times'

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

      <ParamTable record={record} />

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
