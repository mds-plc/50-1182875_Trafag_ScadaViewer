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
import { useFileRecords } from '../hooks/useData'
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
  onDownloadXlsx:  vi.fn(),
  onPageChange:    vi.fn(),
  sortBy:          'created_at',
  sortDir:         'desc' as const,
  onSort:          vi.fn(),
  selectedIds:     new Set<string>(),
  onToggleSelect:  vi.fn(),
  onSelectAll:     vi.fn(),
  onClearSelect:   vi.fn(),
  onBatchDelete:   vi.fn(),
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

  // ── Rozpracovaná zakázka (WIP) ─────────────────────────────────────────

  const WIP = makeFile({
    file_id: 'PROD_ORD7_Cherry_20260924_100000_WIP.csv', name: 'PROD_ORD7_Cherry_20260924_100000_WIP',
    order_id: 'ORD7', switch_name: 'Cherry', record_count: 3, sync_status: 'wip',
  })

  it('WIP order is rendered first, highlighted, with "In progress" badge', () => {
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} wip={[WIP]} total={1} />
      </Wrapper>
    )
    const rows = container.querySelectorAll('tbody > tr.db-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveClass('db-row--wip')
    expect(rows[0]).toHaveTextContent('Cherry')
    expect(rows[1]).not.toHaveClass('db-row--wip')
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('WIP row has no checkbox and no delete button, but can be expanded', () => {
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} wip={[WIP]} />
      </Wrapper>
    )
    const row = container.querySelector('tr.db-row--wip')!
    expect(row.querySelector('input[type="checkbox"]')).toBeNull()
    expect(row.querySelector('.db-icon-btn--danger')).toBeNull()
    fireEvent.click(row)
    expect(DEFAULT_PROPS.onExpandToggle).toHaveBeenCalledWith(WIP.file_id)
  })

  it('WIP row keeps action buttons aligned with other rows (placeholder instead of delete)', () => {
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} wip={[WIP]} total={1} />
      </Wrapper>
    )
    const [wipCell, doneCell] = [...container.querySelectorAll('td.db-td--actions')]
    expect(wipCell.children.length).toBe(doneCell.children.length)
    expect(wipCell.lastElementChild).toHaveClass('db-icon-btn--placeholder')
  })

  it('does not show "no files" message when only a WIP order exists', () => {
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} wip={[WIP]} />
      </Wrapper>
    )
    expect(screen.queryByText('No files in local storage')).toBeNull()
  })

  // ── Rozbalený řádek — jednotné formátování (reálný production záznam) ──

  it('expanded row: units, mΩ, whole µm, open contacts hidden, time with seconds', () => {
    const rec = {
      timestamp: '2026-09-20T11:36:45', status: '2', sortingcategory: '2',
      op_operatingposition: '926.0000', of_operatingforce: '1.0600',
      r_nc_operatingposition_neg: '0.0090', r_no_operatingposition_neg: '1000000.0000',
    }
    const original = vi.mocked(useFileRecords).getMockImplementation()
    vi.mocked(useFileRecords).mockReturnValue({
      records: [rec], loading: false, error: null, fetchRecords: vi.fn(),
      total: 1, pages: 1, groupCounts: { '2': 1 }, fileExpectedCount: null,
    } as unknown as ReturnType<typeof useFileRecords>)
    const file = makeFile()
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} expandedId={file.file_id} />
      </Wrapper>
    )
    const sub = container.querySelector('.db-subtable')!
    const headers = Array.from(sub.querySelectorAll('th')).map(th => th.textContent ?? '')
    expect(headers).toContain('OFN')
    expect(headers).toContain('OPµm')
    expect(headers).toContain('R NCo−mΩ')
    expect(headers.some(h => h.startsWith('R NOo−'))).toBe(false)   // vždy rozepnuto → skryto
    const cells = Array.from(sub.querySelectorAll('tbody td')).map(td => td.textContent ?? '')
    expect(cells).toContain('926')
    expect(cells).toContain('1.06')
    expect(cells).toContain('9.0')
    expect(cells.some(c => /11:36:45/.test(c))).toBe(true)
    if (original) vi.mocked(useFileRecords).mockImplementation(original)
  })

  // ── Prázdná tabulka kvůli datumovému filtru ──────────────────────────

  it('empty because of date filter: offers the last day with records', () => {
    const onShow = vi.fn()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} dataType="testing" hiddenByFilter={308}
          latestCreatedAt="2026-09-22T10:00:00" onShowLatestDay={onShow} />
      </Wrapper>
    )
    expect(screen.getByText('No files in the selected period.')).toBeInTheDocument()
    expect(screen.getByText(/files: 308/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show records up to 22\. 9\. 2026/ }))
    expect(onShow).toHaveBeenCalledWith('2026-09-22')
  })
})
