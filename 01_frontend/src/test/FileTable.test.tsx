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
  it('CSV / XLSX with a reason (machine, no flash drive): muted, reason in title, still clickable', () => {
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} total={1} downloadDisabledReason="Insert a USB flash drive" />
      </Wrapper>
    )
    const btns = Array.from(container.querySelectorAll('.db-download-btn')) as HTMLButtonElement[]
    expect(btns).toHaveLength(2)
    for (const b of btns) {
      expect(b).toHaveClass('db-download-btn--blocked')
      expect(b.title).toBe('Insert a USB flash drive')
      expect(b).not.toBeDisabled()
    }
    fireEvent.click(btns[0])
    expect(DEFAULT_PROPS.onDownload).toHaveBeenCalled()
  })

  it('CSV / XLSX without a reason: normal look', () => {
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} total={1} />
      </Wrapper>
    )
    for (const b of container.querySelectorAll('.db-download-btn')) expect(b).not.toHaveClass('db-download-btn--blocked')
  })

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

  it('production: separate microswitch ID and name columns; "…" until the file is read', () => {
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} total={2} files={[
          makeFile({ file_id: 'A.csv', switch_id: 'E01389-C', switch_name: 'Marquardt' }),
          makeFile({ file_id: 'B.csv', switch_id: '', switch_name: 'E07777-A', record_count: null }),
        ]} />
      </Wrapper>
    )
    expect(screen.getByRole('columnheader', { name: /Microswitch ID/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Microswitch name/ })).toBeInTheDocument()
    expect(screen.getByText('E01389-C')).toBeInTheDocument()
    expect(screen.getByText('Marquardt')).toBeInTheDocument()
    // nepřečtený soubor: druhé pole názvu (u nového souboru ID) se nezobrazí jako název
    expect(screen.queryByText('E07777-A')).toBeNull()
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

  it('production: detail icon opens the order detail directly, without expanding the row', () => {
    const onExpandToggle = vi.fn()
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} total={1} onExpandToggle={onExpandToggle} />
      </Wrapper>
    )
    fireEvent.click(container.querySelector('.db-icon-btn--detail')!)
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/chart?file=MARQ_2026-07-01_DONE.csv'))
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('type=production'))
    expect(onExpandToggle).not.toHaveBeenCalled()
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

  it('admin (canDeleteWip): WIP row has a delete button, still no checkbox (no batch delete)', () => {
    const onDeleteRequest = vi.fn()
    const { container } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} wip={[WIP]} canDeleteWip onDeleteRequest={onDeleteRequest} />
      </Wrapper>
    )
    const row = container.querySelector('tr.db-row--wip')!
    expect(row.querySelector('input[type="checkbox"]')).toBeNull()
    fireEvent.click(row.querySelector('.db-icon-btn--danger')!)
    expect(onDeleteRequest).toHaveBeenCalledWith(WIP)
  })

  it('admin: WIP row has a "Finish order" button; other rows and non-admins do not (2026-10-26)', () => {
    const onFinishRequest = vi.fn()
    const { container, unmount } = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[makeFile()]} wip={[WIP]} total={1} canDeleteWip onFinishRequest={onFinishRequest} />
      </Wrapper>
    )
    expect(container.querySelectorAll('.db-icon-btn--finish')).toHaveLength(1)
    fireEvent.click(container.querySelector('tr.db-row--wip .db-icon-btn--finish')!)
    expect(onFinishRequest).toHaveBeenCalledWith(WIP)
    unmount()
    const r2 = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} wip={[WIP]} onFinishRequest={onFinishRequest} />
      </Wrapper>
    )
    expect(r2.container.querySelector('.db-icon-btn--finish')).toBeNull()
    r2.unmount()
    const r3 = render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} wip={[WIP]} canDeleteWip readOnly onFinishRequest={onFinishRequest} />
      </Wrapper>
    )
    expect(r3.container.querySelector('.db-icon-btn--finish')).toBeNull()
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

  it('expanded row: customer units (mN, µm 0.1, mΩ), open contacts hidden, time with seconds', () => {
    const rec = {      // jak posílá /api/data — jednotky zákazníka (audit X1)
      timestamp: '2026-09-20T11:36:45', status: '2', sortingcategory: '2',
      op_operatingposition: '8574.0', of_operatingforce: '1060',
      r_nc_operatingposition_neg: '9', r_no_operatingposition_neg: '9999.9',
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
    expect(headers).toContain('OFmN')
    expect(headers).toContain('OPµm')
    expect(headers).toContain('R NCo−mΩ')
    expect(headers.some(h => h.startsWith('R NOo−'))).toBe(false)   // vždy rozepnuto → skryto
    const cells = Array.from(sub.querySelectorAll('tbody td')).map(td => td.textContent ?? '')
    expect(cells).toContain('8574.0')
    expect(cells).toContain('1060')
    expect(cells).toContain('9.0')
    expect(cells.some(c => /11:36:45/.test(c))).toBe(true)
    if (original) vi.mocked(useFileRecords).mockImplementation(original)
  })

  // ── F4 — klik během načítání další stránky nesmí otevřít jiný kus ────────

  it('row click while the next page is loading does not open a different record (F4)', () => {
    const page1 = [{ timestamp: '2026-10-01T08:00:00', status: '2' }, { timestamp: '2026-10-01T08:00:10', status: '2' }]
    const page2 = [{ timestamp: '2026-10-01T09:00:00', status: '2' }]
    const state = {
      records: page1 as Record<string, unknown>[], loading: false, error: null, fetchRecords: vi.fn(),
      total: 401, pages: 3, groupCounts: {}, fileExpectedCount: null,
    }
    const original = vi.mocked(useFileRecords).getMockImplementation()
    vi.mocked(useFileRecords).mockImplementation(() => ({ ...state }) as unknown as ReturnType<typeof useFileRecords>)
    const file = makeFile()
    const ui = () => (
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} expandedId={file.file_id} />
      </Wrapper>
    )
    const { container, rerender } = render(ui())
    const rows = () => Array.from(container.querySelectorAll('.db-subtable tbody tr'))
    const num = (r: Element) => r.querySelector('td')?.textContent

    fireEvent.click(screen.getByLabelText('Next page'))          // požadována stránka 2
    state.loading = true                                         // odpověď ještě nepřišla
    rerender(ui())
    expect(num(rows()[0])).toBe('1')                             // zobrazené kusy jsou pořád ze stránky 1
    mockNavigate.mockClear()
    fireEvent.click(rows()[0])
    expect(mockNavigate).not.toHaveBeenCalled()                  // během načítání neotevírat

    state.loading = false
    state.records = page2                                        // stránka 2 dorazila
    rerender(ui())
    expect(num(rows()[0])).toBe(String(200 + 1))
    fireEvent.click(rows()[0])
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('&record=200'))
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

  it('readOnly (remote access) hides delete buttons and selection', () => {
    const file = makeFile()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} readOnly />
      </Wrapper>
    )
    expect(screen.queryByTitle('Delete')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('readOnly + hromadné stažení: výběr jde, lišta výběru má jen Download selected (bez mazání)', () => {
    const file = makeFile()
    const onBatchDownload = vi.fn()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} readOnly onBatchDownload={onBatchDownload}
                   selectedIds={new Set([file.file_id])} />
      </Wrapper>
    )
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.queryByText('Delete selected')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /download selected/i }))
    expect(onBatchDownload).toHaveBeenCalledTimes(1)
  })

  it('u stroje: lišta výběru má Download selected i Delete selected', () => {
    const file = makeFile()
    render(
      <Wrapper>
        <FileTable {...DEFAULT_PROPS} files={[file]} total={1} onBatchDownload={vi.fn()}
                   selectedIds={new Set([file.file_id])} />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /download selected/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument()
  })
})
