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
 *
 * Strategie: mockujeme useDatabaseState, FileTable a DeleteModal.
 * Testy se tak soustředí čistě na JSX logiku Database.tsx
 * bez závislosti na interní logice subkomponent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../context/LangContext'

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

/** Výchozí return hodnota useDatabaseState. */
const defaultState = {
  location:       'local'      as const,
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
  files:          [],
  total:          0,
  pages:          1,
  loading:        false,
  error:          null,
  fetchFiles:     mockFetchFiles,
  remoteAvailable: null as boolean | null,
  showSync:       true,
  totalRecords:   0,
  deleteFile:     mockDeleteFile,
  downloadCsv:    mockDownloadCsv,
}

vi.mock('../hooks/useDatabaseState', () => ({
  useDatabaseState: vi.fn(() => defaultState),
}))

vi.mock('../components/FileTable', () => ({
  default: () => <div data-testid="file-table" />,
}))

vi.mock('../components/DeleteModal', () => ({
  default: () => null,
}))

// -----------------------------------------------------------------------
// Imports (až po mockách)
// -----------------------------------------------------------------------

// eslint-disable-next-line import/first
import Database from '../pages/Database'
// eslint-disable-next-line import/first
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
    const inputs = screen.getAllByDisplayValue('')
    // První input je "from" datum, druhý je "to" datum
    fireEvent.change(inputs[0], { target: { value: '2026-07-01' } })
    expect(mockSetDateFrom).toHaveBeenCalledWith('2026-07-01')
  })

  it('date input "To" onChange calls setDateTo', () => {
    renderDatabase()
    const inputs = screen.getAllByDisplayValue('')
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

  it('Refresh button click calls fetchFiles()', () => {
    renderDatabase()
    // RefreshCw ikona je v buttonu bez textu — najdeme ho přes title
    const btn = screen.getByTitle('Refresh')
    fireEvent.click(btn)
    expect(mockFetchFiles).toHaveBeenCalled()
  })
})
