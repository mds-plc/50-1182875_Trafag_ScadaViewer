/**
 * @file utils/overviewHelpers.ts
 * @description Statická data a helper funkce pro Overview stránku.
 *
 * Extrahováno z Overview.tsx — oddělení dat/logiky od renderovací komponenty.
 *
 * Obsah:
 *   MODE_MAP    — mapování E_APP_ModeManager_Mode UINT → CSS třída + bilingvní texty
 *   ModeClass   — union CSS modifikátorů (.ov-mode--{cls})
 *   ModeInfo    — popis jednoho stavu stroje
 *   fmtTime     — ISO timestamp → HH:MM:SS
 *   fmtDur      — milisekundy → "Xh Ym" nebo "Y min"
 *   fmtHHMM     — ISO timestamp → HH:MM
 */

// ── Typy ─────────────────────────────────────────────────────────────────────

export type ModeClass =
  | 'off' | 'wait' | 'init'
  | 'auto-stop' | 'auto-run'
  | 'service' | 'test'

/** Popis jednoho stavu stroje — CSS varianta a bilingvní texty pro hero badge. */
export interface ModeInfo {
  cls:   ModeClass
  label: Record<'cs' | 'en', string>
  sub:   Record<'cs' | 'en', string>
}

// ── MODE_MAP — E_APP_ModeManager_Mode (TwinCAT ENUM) ─────────────────────────

export const MODE_MAP: Record<number, ModeInfo> = {
  0:  {
    cls: 'off',
    label: { cs: 'Vypnuto',           en: 'Machine Off' },
    sub:   { cs: 'Stroj je vypnut',   en: 'Machine is powered off' },
  },
  3:  {
    cls: 'init',
    label: { cs: 'Tlakování',         en: 'Pressurizing' },
    sub:   { cs: 'Probíhá tlakování hydrauliky', en: 'Hydraulic system pressurizing' },
  },
  4:  {
    cls: 'init',
    label: { cs: 'Spouštění',         en: 'Starting Up' },
    sub:   { cs: 'Spouštění pomocných systémů',  en: 'Starting auxiliary systems' },
  },
  5:  {
    cls: 'wait',
    label: { cs: 'Není zahomováno',   en: 'Not Homed' },
    sub:   { cs: 'Čekání na dokončení homování', en: 'Waiting for homing to complete' },
  },
  6:  {
    cls: 'init',
    label: { cs: 'Homování',          en: 'Homing' },
    sub:   { cs: 'Probíhá nastavení referenčních pozic', en: 'Setting reference positions' },
  },
  9:  {
    cls: 'wait',
    label: { cs: 'Obnova výroby',     en: 'Resume Production' },
    sub:   { cs: 'Čekání na potvrzení operátora', en: 'Waiting for operator confirmation' },
  },
  10: {
    cls: 'auto-stop',
    label: { cs: 'Auto — Stop',       en: 'Auto — Stop' },
    sub:   { cs: 'Automatický režim — čeká na spuštění', en: 'Automatic mode — waiting to start' },
  },
  11: {
    cls: 'test',
    label: { cs: 'Dummy',             en: 'Dummy' },
    sub:   { cs: 'Testovací průchod bez výstupu', en: 'Test run without output' },
  },
  14: {
    cls: 'init',
    label: { cs: 'Zastavování',       en: 'Stopping' },
    sub:   { cs: 'Probíhá řízené zastavování stroje', en: 'Controlled machine shutdown in progress' },
  },
  15: {
    cls: 'auto-run',
    label: { cs: 'Auto — Run',        en: 'Auto — Run' },
    sub:   { cs: 'Automatický provoz — třídění aktivní', en: 'Automatic operation — sorting active' },
  },
  16: {
    cls: 'auto-run',
    label: { cs: 'Režim MSA',         en: 'MSA Mode' },
    sub:   { cs: 'Statistická analýza měřicího systému', en: 'Measurement system analysis' },
  },
  17: {
    cls: 'auto-run',
    label: { cs: 'Režim LI',          en: 'LI Mode' },
    sub:   { cs: 'Kontrola linearity', en: 'Linearity inspection' },
  },
  20: {
    cls: 'service',
    label: { cs: 'Servis',            en: 'Service' },
    sub:   { cs: 'Servisní zásah — výroba přerušena', en: 'Service intervention — production paused' },
  },
  21: {
    cls: 'service',
    label: { cs: 'Servis speciální',  en: 'Service Special' },
    sub:   { cs: 'Speciální servisní operace', en: 'Special service operation' },
  },
  25: {
    cls: 'service',
    label: { cs: 'Krok za krokem',    en: 'Step by Step' },
    sub:   { cs: 'Manuální krokový provoz', en: 'Manual step-by-step operation' },
  },
  30: {
    cls: 'init',
    label: { cs: 'Vyprazdňování',     en: 'Emptying' },
    sub:   { cs: 'Probíhá vyprazdňování systému', en: 'System emptying in progress' },
  },
}

// ── Helper funkce ────────────────────────────────────────────────────────────

/** Formátování ISO timestamp → HH:MM:SS (24h) pro badge. */
export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch { return '' }
}

/** Formátuje ms trvání → "Xh Ym" nebo "Y min". */
export function fmtDur(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

/** Formátuje ISO timestamp → HH:MM */
export function fmtHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}
