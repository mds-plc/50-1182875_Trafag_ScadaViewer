/**
 * @file FileTable.tsx
 * @description Tabulka CSV souborů stránky Database — řádky, rozbalené záznamy
 *   (ExpandedRow), stránkování a footer se součty.
 *   Čistá prezentační komponenta — veškerá logika žije v useDatabaseState.
 */
import React, { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Trash2, BarChart2, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useFileRecords, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import LoadingSpinner from './LoadingSpinner'
import Pagination from './Pagination'
import { formatDate, formatDateTime } from '../utils/formatting'
import type { OrderFile } from '../types'
import type { Location, DataType } from '../hooks/useDatabaseState'
import { CATEGORY_COLORS, categoryColor } from '../utils/groupColors'
import { ALL_PARAM_KEYS, PARAM_LABELS, PARAM_TOOLTIPS, formatParam, hasMeasuredValue, paramUnit } from '../utils/paramMeta'

/** NOK kategorie — sloupce se zobrazí jen pokud je CSV obsahuje. */
const NOK_CATS = [
  { key: 'nokcategory_force',    label: 'F'  },
  { key: 'nokcategory_position', label: 'P'  },
  { key: 'nokcategory_electric', label: 'E'  },
  { key: 'nokcategory_times',    label: 'T'  },
  { key: 'nokcategory_process',  label: 'Pr' },
] as const

// ------------------------------------------------------------------
// ExpandedRow — záznamy jednoho souboru
// ------------------------------------------------------------------

/** Props pro rozbalený řádek tabulky souborů. */
interface ExpandedRowProps {
  file:     OrderFile   // metadata souboru z /api/files
  location: Location    // 'local' | 'remote'
  dataType: DataType    // 'production' | 'testing'
}

/**
 * Rozbalený řádek tabulky — záznamy zvoleného souboru, stránkování, skupinový BarChart.
 * Při kliknutí na záznam naviguje na /chart?...&record=N (detail záznamu).
 * @param file      metadata souboru (file_id, order, microswitch_name…)
 * @param location  'local' | 'remote'
 * @param dataType  'production' | 'testing'
 */
function ExpandedRow({ file, location, dataType }: ExpandedRowProps) {
  const navigate = useNavigate()
  const { t } = useLang()
  const { records, total, pages, groupCounts, fileExpectedCount, loading, error, fetchRecords } = useFileRecords()

  const [recordPage, setRecordPage] = useState(1)
  const [tooltipKey, setTooltipKey] = useState<string | null>(null)

  const chartUrl = `/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`

  // Reset stránky při změně souboru
  useEffect(() => {
    setRecordPage(1)
  }, [file.file_id, location, dataType])

  // Načtení dat (production) při změně stránky — a při změně počtu záznamů
  // (rozpracovaná zakázka: DatabaseGateway přidal záznam → tabulka se doplní sama)
  useEffect(() => {
    if (dataType === 'production') {
      fetchRecords(file.file_id, location, dataType, recordPage)
    }
  }, [file.file_id, file.record_count, location, dataType, recordPage, fetchRecords])

  // groupCounts + fileExpectedCount přicházejí z API — agregovány přes celý soubor,
  // takže skupinový graf je přesný i při stránkování (nezáleží na aktuální stránce).
  const hasGroups = Object.keys(groupCounts).length > 0

  const groupData = useMemo(
    () => [1, 2, 3, 4, 5, 6].map(g => ({
      name:  String(g),
      count: groupCounts[String(g)] ?? 0,
    })),
    [groupCounts]
  )

  // Sloupec group v tabulce — z aktuální stránky záznamů
  const hasGroupCol = useMemo(
    () => records.some(r => r.group != null),
    [records]
  )

  // Výsledkové sloupce — zobrazit jen pokud CSV obsahuje tato pole
  const hasStatusCol   = useMemo(() => records.some(r => r.status          != null && String(r.status          ?? '') !== ''), [records])
  const hasCategoryCol = useMemo(() => records.some(r => r.sortingcategory != null && String(r.sortingcategory ?? '') !== ''), [records])

  const activeNokCats = useMemo(
    () => NOK_CATS.filter(c => records.some(r => r[c.key] != null && String(r[c.key] ?? '') !== '')),
    [records]
  )

  // Měřené parametry (pořadí dle PARAM_GROUPS) — skrýt sloupce bez měřené hodnoty
  // (prázdné, nebo kontakt v celém souboru rozepnutý = ∞)
  const activeParams = useMemo(
    () => ALL_PARAM_KEYS.filter(k => hasMeasuredValue(k, records)),
    [records]
  )

  // Absolutní index záznamu v celém souboru (0-based) — pro navigaci do ChartView
  const absIdx = (i: number) => (recordPage - 1) * RECORDS_PER_PAGE + i

  // ── Production — skupinový graf + podtabulka záznamů ──
  // (Testing se nikdy nerendruje — hlavní řádek Testing má přímé navigate tlačítko)
  //
  // Přestránkování bez blikání: LoadingSpinner jen při prvním načtení (records.length === 0).
  // Při přechodu na jinou stránku zůstane obsah viditelný — pouze se ztlumí opacity.
  return (
    <div className="db-expand">
      {loading && records.length === 0 && <LoadingSpinner />}
      {error   && records.length === 0 && <p className="error-text">{error}</p>}

      {records.length > 0 && (
        <div style={{ opacity: loading ? 0.45 : 1, transition: 'opacity 0.15s' }}>
          {/* Přehled skupin — group_counts přichází z API agregovány přes celý soubor */}
          {dataType === 'production' && hasGroups && (
            <div className="db-order-stats">
              <div className="db-group-chart-wrap">
                <div className="db-order-stats__label">{t.chart.categoryDistribution}</div>
                <ResponsiveContainer width="100%" height={90}>
                  <BarChart data={groupData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {groupData.map((_, idx) => (
                        <Cell key={idx} fill={CATEGORY_COLORS[idx]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {fileExpectedCount != null && (
                <div className="db-count-tile">
                  <div className="db-order-stats__label">{t.db.totalVsExpected}</div>
                  <div className="db-count-tile__values">
                    <span className="db-count-tile__total">{total}</span>
                    <span className="db-count-tile__sep">/</span>
                    <span className="db-count-tile__expected">{String(fileExpectedCount)}</span>
                  </div>
                  <div className="db-count-bar-wrap">
                    <div
                      className="db-count-bar"
                      style={{ width: `${Math.min(100, (total / fileExpectedCount) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Count tile bez skupin — jen počet vs. expected */}
          {dataType === 'production' && !hasGroups && fileExpectedCount != null && (
            <div className="db-order-stats">
              <div className="db-count-tile">
                <div className="db-order-stats__label">{t.db.totalVsExpected}</div>
                <div className="db-count-tile__values">
                  <span className="db-count-tile__total">{total}</span>
                  <span className="db-count-tile__sep">/</span>
                  <span className="db-count-tile__expected">{String(fileExpectedCount)}</span>
                </div>
                <div className="db-count-bar-wrap">
                  <div
                    className="db-count-bar"
                    style={{ width: `${Math.min(100, (total / fileExpectedCount) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tabulka záznamů */}
          <div className="db-subtable-wrap">
            <table className="db-subtable">
              <thead>
                <tr>
                  <th className="db-subtable__th db-subtable__th--num">#</th>
                  <th className="db-subtable__th">{t.db.colTimestamp}</th>
                  {hasGroupCol    && <th className="db-subtable__th db-subtable__th--center">{t.db.colGroup}</th>}
                  {hasStatusCol   && <th className="db-subtable__th db-subtable__th--center" title={PARAM_TOOLTIPS.status}>{t.db.colStatus}</th>}
                  {hasCategoryCol && <th className="db-subtable__th db-subtable__th--center" title={PARAM_TOOLTIPS.sortingcategory}>{t.chart.colCategory}</th>}
                  {activeNokCats.map(c => (
                    <th key={c.key} className="db-subtable__th db-subtable__th--center" title={PARAM_TOOLTIPS[c.key]}>{c.label}</th>
                  ))}
                  {activeParams.map(k => (
                    <th
                      key={k}
                      className="db-subtable__th db-subtable__th--param"
                      onClick={() => setTooltipKey(tooltipKey === k ? null : k)}
                    >
                      {PARAM_LABELS[k] ?? k}<br /><span className="db-subtable__unit">{paramUnit(k)}</span>
                      {tooltipKey === k && (
                        <div className="db-param-tooltip">{PARAM_TOOLTIPS[k] ?? k}</div>
                      )}
                    </th>
                  ))}
                  <th className="db-subtable__th db-subtable__th--actions"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr
                    key={i}
                    className="db-subtable__row"
                    onClick={() => navigate(`${chartUrl}&record=${absIdx(i)}`)}
                  >
                    <td className="db-subtable__td db-subtable__td--num">{absIdx(i) + 1}</td>
                    <td className="db-subtable__td">{formatDateTime(String(r.timestamp ?? ''), true)}</td>
                    {hasGroupCol && (
                      <td className="db-subtable__td db-subtable__td--center">
                        {r.group != null
                          ? (
                            <span
                              className="db-group-badge"
                              style={{ background: categoryColor(r.group) }}
                            >
                              {String(r.group)}
                            </span>
                          )
                          : '—'
                        }
                      </td>
                    )}
                    {hasStatusCol && (
                      <td className="db-subtable__td db-subtable__td--center">
                        {(() => {
                          // OK/NOK primárně z sortingcategory (1–4 OK, 5–6 NOK),
                          // fallback na status pole pokud sortingcategory chybí.
                          const cat = Number(r.sortingcategory ?? 0)
                          if (cat >= 1) {
                            const isNok = cat >= 5
                            return <span className={`db-status-badge db-status-badge--${isNok ? 'nok' : 'ok'}`}>{isNok ? 'NOK' : 'OK'}</span>
                          }
                          const st = String(r.status ?? '')
                          if (st === '2') return <span className="db-status-badge db-status-badge--ok">OK</span>
                          if (st === '5' || st === '6') return <span className="db-status-badge db-status-badge--nok">NOK</span>
                          return <span className="db-status-badge">{st || '—'}</span>
                        })()}
                      </td>
                    )}
                    {hasCategoryCol && (
                      <td className="db-subtable__td db-subtable__td--center">
                        <span className="db-cat-badge" data-cat={String(r.sortingcategory ?? '')}>
                          {String(r.sortingcategory ?? '—')}
                        </span>
                      </td>
                    )}
                    {activeNokCats.map(c => {
                      const v = String(r[c.key] ?? '0')
                      const isFail = v === '1'
                      return (
                        <td key={c.key} className="db-subtable__td db-subtable__td--center">
                          <span className={`db-nok-icon db-nok-icon--${isFail ? 'fail' : 'ok'}`}>
                            {isFail ? '!' : '\u2713'}
                          </span>
                        </td>
                      )
                    })}
                    {activeParams.map(k => {
                      const f = formatParam(k, r[k])
                      return (
                        <td key={k} className="db-subtable__td db-subtable__td--param"
                          title={f.open ? t.chart.openContact : undefined}>
                          {f.text}
                        </td>
                      )
                    })}
                    <td className="db-subtable__td db-subtable__td--actions">
                      <button
                        className="db-icon-btn"
                        title={t.db.openInChart}
                        onClick={e => {
                          e.stopPropagation()
                          navigate(`${chartUrl}&record=${absIdx(i)}`)
                        }}
                      >
                        <BarChart2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stránkování záznamu v expand */}
          <Pagination page={recordPage} pages={pages} onPage={setRecordPage} />

          {/* Footer */}
          <div className="db-expand__footer">
            <div className="db-expand__stats">
              <span>{t.db.rangeRecords}: <strong>{total}</strong></span>
              {records.length > 1 && (
                <span className="db-expand__range">
                  {formatDateTime(records[0].timestamp)} &ndash;{' '}
                  {formatDateTime(records[records.length - 1].timestamp)}
                </span>
              )}
            </div>
            <button className="btn btn--primary btn--sm" onClick={() => navigate(chartUrl)}>
              <BarChart2 size={16} />
              {t.db.orderDetail}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// FileTable — hlavní tabulka s řádky, stránkováním a footerem
// ------------------------------------------------------------------

interface Props {
  files:           OrderFile[]
  /** Rozpracované zakázky — zobrazí se nahoře, zvýrazněné, bez mazání a výběru */
  wip?:            OrderFile[]
  /** Datumový filtr skryl vše: počet souborů mimo filtr (0 = nic skryté) */
  hiddenByFilter?:    number
  /** Datum nejnovějšího souboru mimo filtr (ISO) */
  latestCreatedAt?:   string | null
  /** Přepnout filtr tak, aby končil daným dnem (YYYY-MM-DD) — tlačítko v prázdném stavu */
  onShowLatestDay?:   (day: string) => void
  loading:         boolean
  error:           string | null
  dataType:        DataType
  location:        Location
  showSync:        boolean
  page:            number
  pages:           number
  total:           number
  totalRecords:    number
  expandedId:      string | null
  onExpandToggle:   (fileId: string) => void
  onDeleteRequest:  (file: OrderFile) => void
  onDownload:       (file: OrderFile) => void
  onDownloadXlsx:   (file: OrderFile) => void
  onPageChange:     (page: number) => void
  sortBy:           string
  sortDir:          'asc' | 'desc'
  onSort:           (col: string) => void
  selectedIds:      Set<string>
  onToggleSelect:   (id: string) => void
  onSelectAll:      () => void
  onClearSelect:    () => void
  onBatchDelete:    () => void
}

export default function FileTable({
  files, wip = [], hiddenByFilter = 0, latestCreatedAt = null, onShowLatestDay, loading, error,
  dataType, location, showSync,
  page, pages, total, totalRecords,
  expandedId, onExpandToggle, onDeleteRequest, onDownload, onDownloadXlsx, onPageChange,
  sortBy, sortDir, onSort,
  selectedIds, onToggleSelect, onSelectAll, onClearSelect, onBatchDelete,
}: Props) {
  const { t } = useLang()
  const navigate = useNavigate()

  // colspan: checkbox + # + created + [order] + switch + [records] + [sync] + actions
  const showRecords = dataType === 'production'
  const colSpan = 4 + (dataType === 'production' ? 1 : 0) + (showRecords ? 1 : 0) + (showSync ? 1 : 0) + 2

  /** Sortovatelný záhlaví sloupce */
  function SortTh({ col, children, className }: { col: string; children: React.ReactNode; className?: string }) {
    const active = sortBy === col
    return (
      <th
        className={`db-th db-th--sortable${active ? ' db-th--sort-active' : ''}${className ? ` ${className}` : ''}`}
        onClick={() => onSort(col)}
      >
        {children}
        <span className="db-sort-icon">{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
      </th>
    )
  }

  /** Jeden řádek tabulky (+ rozbalený detail). isWip = rozpracovaná zakázka (zvýrazněná, bez mazání). */
  function renderRow(file: OrderFile, index: number, isWip: boolean) {
    return (
      <Fragment key={file.file_id}>
        <tr
          className={`db-row${isWip ? ' db-row--wip' : ''}${expandedId === file.file_id ? ' db-row--expanded' : ''}`}
          title={isWip ? t.db.wipTooltip : undefined}
          onClick={dataType === 'production'
            ? () => onExpandToggle(file.file_id)
            : () => navigate(`/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`)
          }
        >
          <td className="db-td db-td--check" onClick={e => e.stopPropagation()}>
            {!isWip && (
              <input
                type="checkbox"
                checked={selectedIds.has(file.file_id)}
                onChange={() => onToggleSelect(file.file_id)}
              />
            )}
          </td>
          <td className="db-td db-td--num">
            {isWip ? <span className="db-wip-dot" aria-label={t.db.badgeWip} /> : index + 1}
          </td>
          <td className="db-td">{formatDateTime(file.created_at)}</td>
          {dataType === 'production' && (
            <td className="db-td db-td--mono">{file.order_id ?? '—'}</td>
          )}
          <td className="db-td">{file.switch_name}</td>
          {showRecords && (
            <td className="db-td db-td--center">
              <span className="db-badge">{file.record_count}</span>
            </td>
          )}
          {showSync && (
            <td className="db-td db-td--center">
              {isWip
                ? <span className="badge badge--wip">{t.db.badgeWip}</span>
                : file.sync_status === 'done_remote'
                  ? <span className="badge badge--success">{t.db.badgeSynced}</span>
                  : <span className="badge badge--warning">{t.db.badgeLocal}</span>
              }
            </td>
          )}
          <td className="db-td db-td--actions" onClick={e => e.stopPropagation()}>
            {dataType === 'testing' ? (
              <button
                className="db-icon-btn"
                title={t.db.orderDetail}
                onClick={() => navigate(
                  `/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`
                )}
              >
                <BarChart2 size={18} />
              </button>
            ) : (
              <button
                className={`db-icon-btn${expandedId === file.file_id ? ' db-icon-btn--active' : ''}`}
                onClick={() => onExpandToggle(file.file_id)}
                title={t.db.showRecords}
              >
                <ChevronDown size={18} />
              </button>
            )}
            {/* Stahování — vždy vedle sebe */}
            <button
              className="db-download-btn"
              title={t.chart.exportCsv}
              onClick={() => onDownload(file)}
            >
              <Download size={14} /> CSV
            </button>
            <button
              className="db-download-btn"
              title={t.db.downloadXlsx}
              onClick={() => onDownloadXlsx(file)}
            >
              <Download size={14} /> XLSX
            </button>
            {isWip ? (
              // Rozpracovanou zakázku nelze smazat — prázdné místo stejné šířky,
              // aby tlačítka CSV / XLSX zůstala ve všech řádcích na stejné pozici
              <span className="db-icon-btn db-icon-btn--placeholder" aria-hidden="true" />
            ) : (
              <button
                className="db-icon-btn db-icon-btn--danger"
                title={t.common.delete}
                onClick={() => onDeleteRequest(file)}
              >
                <Trash2 size={18} />
              </button>
            )}
          </td>
        </tr>

        {expandedId === file.file_id && dataType === 'production' && (
          <tr className="db-expand-row">
            <td colSpan={colSpan}>
              <ExpandedRow file={file} location={location} dataType={dataType} />
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <>
      {loading && files.length === 0 && <LoadingSpinner />}
      {error   && files.length === 0 && <p className="error-text">{error}</p>}

      {(files.length > 0 || (!loading && !error)) && (
        <>
          {/* Batch toolbar — viditelný jen pokud je něco vybráno */}
          {selectedIds.size > 0 && (
            <div className="db-batch-toolbar">
              <span className="db-batch-toolbar__count">
                <strong>{selectedIds.size}</strong> {t.db.selectedCount}
              </span>
              <button className="btn btn--danger btn--sm" onClick={onBatchDelete}>
                {t.db.deleteSelected}
              </button>
              <button className="btn btn--secondary btn--sm" onClick={onClearSelect}>
                {t.db.clearSelection}
              </button>
            </div>
          )}

          <table className="db-table">
            <thead>
              <tr>
                <th className="db-th db-td--check" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={files.length > 0 && files.every(f => selectedIds.has(f.file_id))}
                    onChange={() => files.every(f => selectedIds.has(f.file_id)) ? onClearSelect() : onSelectAll()}
                    title="Vybrat vše"
                  />
                </th>
                <th className="db-th db-th--num">#</th>
                <SortTh col="created_at">{t.db.colCreated}</SortTh>
                {dataType === 'production' && <SortTh col="order_id">{t.db.colOrder}</SortTh>}
                <SortTh col="switch_name">{t.db.colSwitchType}</SortTh>
                {showRecords && <SortTh col="record_count" className="db-th--center">{t.db.colRecords}</SortTh>}
                {showSync && <th className="db-th db-th--center">{t.db.colSync}</th>}
                <th className="db-th db-th--actions"></th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && wip.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="db-empty">
                    {hiddenByFilter > 0 ? (
                      <div className="db-empty__filtered">
                        <div>{t.db.noFilesInRange}</div>
                        <div className="db-empty__hint">
                          {t.db.hiddenByFilter
                            .replace('{count}', String(hiddenByFilter))
                            .replace('{date}', formatDateTime(latestCreatedAt ?? ''))}
                        </div>
                        {onShowLatestDay && latestCreatedAt && /^\d{4}-\d{2}-\d{2}/.test(latestCreatedAt) && (
                          <button className="btn btn--primary btn--sm"
                            onClick={() => onShowLatestDay(latestCreatedAt.slice(0, 10))}>
                            {t.db.showLatestDay.replace('{date}', formatDate(latestCreatedAt))}
                          </button>
                        )}
                      </div>
                    ) : (location === 'local' ? t.db.noFilesLocal : t.db.noFilesRemote)}
                  </td>
                </tr>
              )}
              {wip.map((file, i) => renderRow(file, i, true))}
              {files.map((file, i) => renderRow(file, i, false))}
            </tbody>
          </table>

          {pages > 1 && (
            <Pagination page={page} pages={pages} onPage={onPageChange} />
          )}

          {files.length > 0 && (
            <div className="db-footer">
              <span>{t.db.footerFiles}: <strong>{total}</strong></span>
              <span>{t.db.footerTotalRecords}: <strong>{totalRecords}</strong></span>
            </div>
          )}
        </>
      )}
    </>
  )
}
