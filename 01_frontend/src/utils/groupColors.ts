/**
 * Barvy boxů / třídicích kategorií 1–6 — JEDINÁ paleta pro celou aplikaci (grafy, štítky,
 * tečky v OrderHero). Každý box má vlastní barvu; červená a růžová jsou u NOK boxů 5 a 6,
 * OK boxy 1–4 červenou nemají. OK/NOK se čte z popisku, ne z barvy.
 * Musí odpovídat .db-cat-badge[data-cat] v styles/database.css.
 */
export const CATEGORY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899']

/** Barva pro kategorii 1–6 (šedá pro neznámou). */
export function categoryColor(cat: unknown): string {
  const i = Number(cat) - 1
  return i >= 0 && i < CATEGORY_COLORS.length ? CATEGORY_COLORS[i] : '#9ca3af'
}

/** @deprecated původní název — stejná paleta jako CATEGORY_COLORS */
export const GROUP_COLORS = CATEGORY_COLORS
