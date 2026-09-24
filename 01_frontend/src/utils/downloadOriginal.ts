/**
 * @file utils/downloadOriginal.ts
 * @description Stáhne originální CSV soubor z backendu v nezměněném formátu.
 *
 * Používá endpoint GET /api/files/{id}/download, který vrací soubor
 * přesně tak, jak ho zapsal DatabaseGateway — včetně sekcí, hlaviček a BOM.
 */
import { apiFetch } from './apiFetch'

/**
 * Stáhne originální CSV soubor přes backend download endpoint.
 *
 * @param fileId   Název souboru (file_id)
 * @param location 'local' | 'remote'
 * @param fileType 'production' | 'testing'
 * @param token    Bearer token pro autentizaci
 * @param onError  Volitelný callback při selhání (např. toast)
 */
export function downloadOriginalCsv(
  fileId:   string,
  location: string,
  fileType: string,
  token:    string,
  onError?: (msg: string) => void,
): void {
  const params = new URLSearchParams({ location, type: fileType })
  const url = `/api/files/${encodeURIComponent(fileId)}/download?${params}`

  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

  apiFetch(url, { headers })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileId
      a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    })
    .catch(err => {
      if (onError) onError(String(err))
      else console.error('[downloadOriginalCsv] download selhal:', err)
    })
}
