/**
 * @file formatting.ts
 * @description Sdílené formátovací utility — datum, čas, čísla.
 */

/**
 * Naformátuje ISO 8601 timestamp do lokálního formátu cs-CZ.
 * Vrátí '—' pro prázdný řetězec, původní hodnotu při chybě parsování.
 */
export function formatDateTime(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric', month: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}
