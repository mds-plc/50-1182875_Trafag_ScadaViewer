/**
 * @file exportXlsx.test.ts
 * @description Stažení XLSX ze serveru:
 *   - název bez přípony CSV (`…_DONE.csv.xlsx` by Windows ukázal jako „…_DONE.csv")
 *   - správný endpoint /api/files/{id}/xlsx s location + type a Bearer tokenem
 *   - bez File System Access API → běžné stažení s názvem .xlsx
 *   - chyba serveru → výjimka (volající zobrazí toast)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { xlsxBaseName, exportFileXlsx } from '../utils/exportXlsx'

describe('xlsxBaseName', () => {
  it('strips the .csv extension', () => {
    expect(xlsxBaseName('PROD_trafag test 1_Marquardt_20260921_090943_DONE.csv'))
      .toBe('PROD_trafag test 1_Marquardt_20260921_090943_DONE')
    expect(xlsxBaseName('TEST_X_DONE.CSV')).toBe('TEST_X_DONE')
  })

  it('keeps names without .csv unchanged', () => {
    expect(xlsxBaseName('ORDER_1_DONE')).toBe('ORDER_1_DONE')
    expect(xlsxBaseName('a.csv.backup')).toBe('a.csv.backup')
  })
})

describe('exportFileXlsx', () => {
  let clicked: string[]

  beforeEach(() => {
    clicked = []
    vi.stubGlobal('fetch', vi.fn())
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the server-built file under an .xlsx name', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new Blob(['PK']), { status: 200 }))
    await exportFileXlsx('PROD_1 A_DONE.csv', 'remote', 'production', 'tok')
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/files/PROD_1%20A_DONE.csv/xlsx?location=remote&type=production')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(clicked).toEqual(['PROD_1 A_DONE.xlsx'])
  })

  it('throws on server error and downloads nothing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('x', { status: 503 }))
    await expect(exportFileXlsx('A_DONE.csv', 'local', 'production', null)).rejects.toThrow('HTTP 503')
    expect(clicked).toEqual([])
  })
})
