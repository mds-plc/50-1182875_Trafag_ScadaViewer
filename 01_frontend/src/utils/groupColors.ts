/**
 * Barvy boxů / třídicích kategorií 1–6 — JEDINÁ paleta pro celou aplikaci (grafy, štítky,
 * tečky v OrderHero, filtr kusů). Odpovídá barvám štítků fyzických třídicích krabic u stroje
 * (Marquardt 1050, BG 01794 — zadání uživatele 2026-10-16):
 *   1 černý (E01793) · 2 světle modrý (E01794) · 3 magenta (E01795) · 4 zelený (E01796)
 *   5 žlutý — NOK Trafag, Ausschuss (E01832) · 6 červeno-oranžový — NOK Supplier, Ausschuss (E01833)
 * OK/NOK se čte z popisku a pásu v grafu, ne z barvy.
 * Musí odpovídat .db-cat-badge[data-cat] v styles/database.css.
 */
export const CATEGORY_COLORS = ['#18181b', '#38bdf8', '#d946ef', '#16a34a', '#facc15', '#ea580c']

/** Světlé barvy (světle modrá, žlutá) potřebují tmavý text — bílý by nebyl čitelný. */
const DARK_TEXT = new Set([2, 5])

/** Barva pro kategorii 1–6 (šedá pro neznámou). */
export function categoryColor(cat: unknown): string {
  const i = Number(cat) - 1
  return i >= 0 && i < CATEGORY_COLORS.length ? CATEGORY_COLORS[i] : '#9ca3af'
}

/** Barva textu na podkladu barvy kategorie (štítek, aktivní tlačítko filtru). */
export function categoryTextColor(cat: unknown): string {
  return DARK_TEXT.has(Number(cat)) ? '#111827' : '#fff'
}

/** @deprecated původní název — stejná paleta jako CATEGORY_COLORS */
export const GROUP_COLORS = CATEGORY_COLORS
