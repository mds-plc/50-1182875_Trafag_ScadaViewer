/**
 * @file formatting.ts
 * @description Sdílené formátovací utility — datum, čas, čísla.
 */

/**
 * Naformátuje ISO 8601 timestamp do lokálního formátu cs-CZ.
 * Vrátí '—' pro prázdný řetězec, původní hodnotu při chybě parsování.
 */
export function formatDateTime(iso: string, withSeconds = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso          // neparsovatelné — zobrazit jak je
  return d.toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

/** Jen datum (cs-CZ, např. „22. 9. 2026"); neparsovatelné → původní hodnota. */
export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
}
