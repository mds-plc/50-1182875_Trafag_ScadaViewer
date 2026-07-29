/**
 * @file FileTable.test.tsx
 * @description Testy komponenty FileTable (databázová tabulka):
 *   - prázdný stav — "No files" zpráva
 *   - zobrazení souboru (switch_name, record_count)
 *   - klik na řádek production → onExpandToggle callback
 *   - klik na řádek testing → navigate na /chart
 *   - klik na Delete ikonu → onDeleteRequest callback
 *   - klik na Download ikonu → onDownload callback
 *   - production: tlačítko pro expand (ChevronDown, title "Show records")
 *   - sync badge: "Synced" pro done_remote, "Local" pro done_local
 *   - Pagination viditelná při pages > 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../context/LangContext'
import FileTable from '../components/FileTable'
import type { OrderFile } from '../types'

// -----------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => mockNavigate,
}))

// Mock useFileRecords — volá se uvnitř ExpandedRow, ne v main tabulce.
// Bez mocku by renderování ExpandedRow spustilo skutečný fetch.
vi.mock('../hooks/useData', async (importOriginal) => ({
  ...await importOriginal<typeof import('../hooks/useData')>(),
  useFileRecords: vi.fn(() => ({
    records:           [],
    loading:           false,
    error:             null,
    fetchRecords:      vi.fn(),
    total:             0,
    pages:             1,
    groupCounts:       {},
    fileExpectedCount: null,
  })),
}))

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const Wrapper = ({ children }: { children: ReactNode }) => (
  <LangProvider>
    <MemoryRouter>{children}</MemoryRouter>
  </LangProvider>
)

function makeFile(overrides: Partial<OrderFile> = {}): OrderFile {
  return {
    file_id:      'MARQ_2026-07-01_DONE.csv',
    name:         'MARQ_2026-07-01_DONE',
    type:         'production',
    location:     'local',
    switch_name:  'Marquardt',
    created_at:   '2026-07-01T08:00:00',
    record_count: 5,
    order_id:     'ORD-001',
    sync_status:  'done_local',
    ...overrides,
  }
}

const DEFAULT_PROPS = {
  files:           [] as OrderFile[],
  loading:         false,
  error:           null,
  dataType:        'production' as const,
  location:        'local' as const,
  showSync:        true,
  page:            1,
  pages:           1,
  total:           0,
  totalRecords:    0,
  expandedId:      null,
  onExpandToggle:  vi.fn(),
  onDeleteRequest: vi.fn(),
  onDownload:      vi.fn(),
  onPageChange:    vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// -----------------------------------------------------------------------
// Testy
// -----------------------------------------------------------------------

describe('FileTable', () => {
  it('shows "no files" message when files list is empty', () => {
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} />
      </Wrapper>
    )
    expect(screen.getByText('No files in local storage')).toBeInTheDocument()
  })

  it('displays file switch_name and record_count badge', () => {
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} total={1} />
      </Wrapper>
    )
    expect(screen.getByText('Marquardt')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()   // record_count badge
  })

  it('clicking production row calls onExpandToggle with file_id', () => {
    const onExpandToggle = vi.fn()
    const { container } = render(
      <Wrapper>
        <FileTable
          {...DEFAULT_PROPS}
          files={[makeFile()]}
          total={1}
          onExpandToggle={onExpandToggle}
        />
      </Wrapper>
    )
    fireEvent.click(container.querySelector('.db-row')!)
    expect(onExpandToggle).toHaveBeenCalledWith('MARQ_2026-07-01_DONE.csv')
  })

  it('clicking testing row navigates to /chart with type=testing', () => {
    const { container } = render(
      <Wrapper>
        <FileTable
          {...DEFAULT_PROPS}
          files={[makeFile({ type: 'testing', order_id: null })]}
          total={1}
          dataType="testing"
        />
      </Wrapper>
    )
    fireEvent.click(container.querySelector('.db-row')!)
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/chart'))
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('type=testing'))
  })

  it('clicking Delete button calls onDeleteRequest with the file', () => {
    const onDeleteRequest = vi.fn()
    const file = makeFile()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} onDeleteRequest={onDeleteRequest} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTitle('Delete'))
    expect(onDeleteRequest).toHaveBeenCalledWith(file)
  })

  it('clicking Download button calls onDownload with the file', () => {
    const onDownload = vi.fn()
    const file = makeFile()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} onDownload={onDownload} />
      </Wrapper>
    )
    fireEvent.click(screen.getByTitle('Download CSV'))
    expect(onDownload).toHaveBeenCalledWith(file)
  })

  it('production file has "Show records" expand button', () => {
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} total={1} dataType="production" />
      </Wrapper>
    )
    expect(screen.getByTitle('Show records')).toBeInTheDocument()
  })

  it('sync badge shows "Synced" for done_remote and "Local" for done_local', () => {
    render(
      <Wrapper>
        <FileTable
          {...DEFAULT_PROPS}
          files={[
            makeFile({ file_id: 'A_DONE.csv', sync_status: 'done_remote' }),
            makeFile({ file_id: 'B_DONE.csv', sync_status: 'done_local' }),
          ]}
          total={2}
        />
      </Wrapper>
    )
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('Local')).toBeInTheDocument()
  })

  it('renders Pagination component when pages > 1', () => {
    const { container } = render(
      <Wrapper>
        <FileTable
          {...DEFAULT_PROPS}
          files={[makeFile({ file_id: 'A_DONE.csv' }), makeFile({ file_id: 'B_DONE.csv' })]}
          total={2}
          pages={2}
          page={1}
        />
      </Wrapper>
    )
    expect(container.querySelector('.pagination')).toBeInTheDocument()
  })
})
