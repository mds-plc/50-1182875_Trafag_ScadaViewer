/**
 * @file Database.test.tsx
 * @description Testy stránky Database:
 *   - render: nadpis "Database" je viditelný
 *   - tab "Remote" klik → volá setLocation('remote')
 *   - tab "Testing" klik → volá setDataType('testing')
 *   - date input onChange → volá setDateFrom / setDateTo
 *   - Clear button vymaže datum filtry (volá setDateFrom('') + setDateTo(''))
 *   - remote alert viditelný jen při location='remote' + remoteAvailable=false
 *   - Refresh button → volá fetchFiles()
 *   - StorageBar (lokální úložiště) a NasStorageBar (NAS) vždy obě, na obou záložkách
 *
 * Strategie: mockujeme useDatabaseState, FileTable, DeleteModal, StorageBar a NasStorageBar.
 * Testy se tak soustředí čistě na JSX logiku Database.tsx
 * bez závislosti na interní logice subkomponent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../context/LangContext'
import type { BulkRequest } from '../types'

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

const mockSetLocation     = vi.fn()
const mockSetDataType     = vi.fn()
const mockSetDateFrom     = vi.fn()
const mockSetDateTo       = vi.fn()
const mockFetchFiles      = vi.fn()
const mockSetExpandedId   = vi.fn()
const mockSetDeleteTarget = vi.fn()
const mockDeleteFile      = vi.fn()
const mockDownloadCsv     = vi.fn()
const mockSetSearchInput  = vi.fn()
const mockOpenBulk        = vi.fn()

/** Výchozí return hodnota useDatabaseState. */
const defaultState = {
  location:       'local'      as 'local' | 'remote',
  setLocation:    mockSetLocation,
  dataType:       'production' as const,
  setDataType:    mockSetDataType,
  dateFrom:       '',
  setDateFrom:    mockSetDateFrom,
  dateTo:         '',
  setDateTo:      mockSetDateTo,
  page:           1,
  setPage:        vi.fn(),
  expandedId:     null,
  setExpandedId:  mockSetExpandedId,
  deleteTarget:   null,
  setDeleteTarget: mockSetDeleteTarget,
  canDeleteUnsynced: false,
  searchInput:    '',
  setSearchInput: mockSetSearchInput,
  searchQuery:    '',
  searchAllDates: false,
  files:          [],
  wip:            [],
  hiddenByFilter: 0,
  latestCreatedAt: null,
  showDaysUntil:  vi.fn(),
  total:          0,
  pages:          1,
  loading:        false,
  error:          null,
  fetchFiles:     mockFetchFiles,
  remoteAvailable: null as boolean | null,
  showSync:       true,
  readOnly:       false,
  totalRecords:   0,
  deleteFile:     mockDeleteFile,
  downloadCsv:    mockDownloadCsv,
  downloadXlsx:   vi.fn(),
  sortBy:         'created_at',
  sortDir:        'desc' as const,
  onSort:         vi.fn(),
  selectedIds:    new Set<string>(),
  toggleSelect:   vi.fn(),
  selectAll:      vi.fn(),
  clearSelect:    vi.fn(),
  batchDelete:    vi.fn(),
  batchConfirm:   false,
  setBatchConfirm: vi.fn(),
  finishTarget:   null,
  setFinishTarget: vi.fn(),
  finishWip:      vi.fn(),
  downloadDisabledReason: null as string | null,
  bulkRequest:    null as BulkRequest | null,
  openBulk:       mockOpenBulk,
  closeBulk:      vi.fn(),
}

vi.mock('../components/BulkExportModal', () => ({
  default: () => <div data-testid="bulk-modal" />,
}))

vi.mock('../context/PlcContext', () => ({
  usePlcConnection: () => ({ connected: true, adsConnected: true, plcLoggedIn: false }),
}))

vi.mock('../hooks/useDatabaseState', () => ({
  useDatabaseState: vi.fn(() => defaultState),
}))

vi.mock('../components/FileTable', () => ({
  default: () => <div data-testid="file-table" />,
}))

vi.mock('../components/DeleteModal', () => ({
  default: () => null,
}))

vi.mock('../components/StorageBar', () => ({
  default: () => <div data-testid="storage-bar" />,
}))

vi.mock('../components/UsbStorageBar', () => ({
  default: () => <div data-testid="usb-storage-bar" />,
}))

vi.mock('../components/NasStorageBar', () => ({
  default: () => <div data-testid="nas-storage-bar" />,
}))

// -----------------------------------------------------------------------
// Imports (až po mockách)
// -----------------------------------------------------------------------

import Database from '../pages/Database'
import { useDatabaseState } from '../hooks/useDatabaseState'

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const Wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider>
    <MemoryRouter>{children}</MemoryRouter>
  </LangProvider>
)

function renderDatabase(stateOverrides: Partial<typeof defaultState> = {}) {
  vi.mocked(useDatabaseState).mockReturnValue({ ...defaultState, ...stateOverrides })
  return render(<Database />, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useDatabaseState).mockReturnValue(defaultState)
  localStorage.clear()
})

// -----------------------------------------------------------------------
// Testy
// -----------------------------------------------------------------------

describe('Database page', () => {
  it('renders page title "Database"', () => {
    renderDatabase()
    expect(screen.getByText('Database')).toBeInTheDocument()
  })

  it('clicking Remote tab calls setLocation("remote")', () => {
    renderDatabase()
    fireEvent.click(screen.getByText('Remote'))
    expect(mockSetLocation).toHaveBeenCalledWith('remote')
  })

  it('clicking Testing tab calls setDataType("testing")', () => {
    renderDatabase()
    fireEvent.click(screen.getByText('Testing'))
    expect(mockSetDataType).toHaveBeenCalledWith('testing')
  })

  it('date input "From" onChange calls setDateFrom', () => {
    renderDatabase()
    const inputs = screen.getAllByDisplayValue('').filter(el => (el as HTMLInputElement).type === 'date')
    // První datum je "from", druhé "to" (pole hledání zakázky se nepočítá)
    fireEvent.change(inputs[0], { target: { value: '2026-07-01' } })
    expect(mockSetDateFrom).toHaveBeenCalledWith('2026-07-01')
  })

  it('date input "To" onChange calls setDateTo', () => {
    renderDatabase()
    const inputs = screen.getAllByDisplayValue('').filter(el => (el as HTMLInputElement).type === 'date')
    fireEvent.change(inputs[1], { target: { value: '2026-07-31' } })
    expect(mockSetDateTo).toHaveBeenCalledWith('2026-07-31')
  })

  it('Clear button calls setDateFrom("") and setDateTo("") when dates are set', () => {
    renderDatabase({ dateFrom: '2026-07-01', dateTo: '2026-07-31' })
    fireEvent.click(screen.getByText(/clear/i))
    expect(mockSetDateFrom).toHaveBeenCalledWith('')
    expect(mockSetDateTo).toHaveBeenCalledWith('')
  })

  it('remote alert is visible only when location="remote" and remoteAvailable=false', () => {
    // Žádný alert při location=local
    renderDatabase({ location: 'local', remoteAvailable: false })
    expect(screen.queryByText(/remote storage is unavailable/i)).toBeNull()

    // Alert se zobrazí při location=remote + remoteAvailable=false
    renderDatabase({ location: 'remote', remoteAvailable: false })
    expect(screen.getByText(/remote storage is unavailable/i)).toBeInTheDocument()
  })

  it('local and NAS storage bars are shown together on both tabs', () => {
    const { unmount } = renderDatabase({ location: 'local' })
    expect(screen.getByTestId('storage-bar')).toBeInTheDocument()
    expect(screen.getByTestId('nas-storage-bar')).toBeInTheDocument()
    unmount()
    renderDatabase({ location: 'remote' })
    expect(screen.getByTestId('storage-bar')).toBeInTheDocument()
    expect(screen.getByTestId('nas-storage-bar')).toBeInTheDocument()
  })

  it('Refresh button click calls fetchFiles()', () => {
    renderDatabase()
    // RefreshCw ikona je v buttonu bez textu — najdeme ho přes title
    const btn = screen.getByTitle('Refresh')
    fireEvent.click(btn)
    expect(mockFetchFiles).toHaveBeenCalled()
  })
  it('search input (Production) calls setSearchInput, Escape clears', () => {
    renderDatabase()
    const box = screen.getByRole('searchbox')
    fireEvent.change(box, { target: { value: 'ZAK-12' } })
    expect(mockSetSearchInput).toHaveBeenCalledWith('ZAK-12')
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(mockSetSearchInput).toHaveBeenCalledWith('')
  })

  it('search input hidden on Testing tab', () => {
    renderDatabase({ dataType: 'testing' as unknown as 'production' })
    expect(screen.queryByRole('searchbox')).toBeNull()
  })
  it('active search suspends date filter (inputs disabled + note)', () => {
    renderDatabase({ searchInput: 'ABC', searchQuery: 'ABC', searchAllDates: true })
    const dates = Array.from(document.querySelectorAll('input[type="date"]'))
    expect(dates).toHaveLength(2)
    expect(dates.every(d => (d as HTMLInputElement).disabled)).toBe(true)
    expect(screen.getByText(/ve všech datech|all dates/i)).toBeInTheDocument()
  })

  it('Download all shows the filter count, opens bulk download for the filter; disabled when empty', () => {
    const { unmount } = renderDatabase({ total: 0 })
    expect(screen.getByRole('button', { name: /download all/i })).toBeDisabled()
    unmount()
    renderDatabase({ total: 37 })
    const btn = screen.getByRole('button', { name: /download all \(37\)/i })
    fireEvent.click(btn)
    expect(mockOpenBulk).toHaveBeenCalledWith(false)
    expect(screen.queryByTestId('bulk-modal')).toBeNull()
  })

  it('Download all disabled on Remote while NAS is unavailable; modal rendered for bulkRequest', () => {
    const { unmount } = renderDatabase({ total: 5, location: 'remote', remoteAvailable: false })
    expect(screen.getByRole('button', { name: /download all/i })).toBeDisabled()
    unmount()
    renderDatabase({ total: 5, bulkRequest: { location: 'local', type: 'production' } })
    expect(screen.getByTestId('bulk-modal')).toBeInTheDocument()
  })
})
