/**
 * @file FileTable.tsx
 * @description Tabulka CSV souborů stránky Database — řádky, rozbalené záznamy
 *   (ExpandedRow), stránkování a footer se součty.
 *   Čistá prezentační komponenta — veškerá logika žije v useDatabaseState.
 */
import { Fragment, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Trash2, BarChart2, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useFileRecords } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import LoadingSpinner from './LoadingSpinner'
import Pagination from './Pagination'
import { formatDateTime } from '../utils/formatting'
import type { OrderFile } from '../types'
import type { Location, DataType } from '../hooks/useDatabaseState'

const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// ------------------------------------------------------------------
// ExpandedRow — záznamy jednoho souboru
// ------------------------------------------------------------------

interface ExpandedRowProps {
  file:     OrderFile
  location: Location
  dataType: DataType
}

function ExpandedRow({ file, location, dataType }: ExpandedRowProps) {
  const navigate = useNavigate()
  const { t } = useLang()
  const { records, loading, error, fetchRecords } = useFileRecords()

  const chartUrl = `/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`

  // Pro testing záznamy nenačítáme — vše je v detailu celého souboru
  useEffect(() => {
    if (dataType === 'production') {
      fetchRecords(file.file_id, location, dataType)
    }
  }, [file.file_id, location, dataType, fetchRecords])

  const hasGroups = useMemo(
    () => records.some(r => r.group != null),
    [records]
  )

  const groupData = useMemo(
    () => [1, 2, 3, 4, 5, 6].map(g => ({
      name:  String(g),
      count: records.filter(r => Number(r.group) === g).length,
    })),
    [records]
  )

  const expectedCount = useMemo(
    () => records.find(r => r.expected_count != null)?.expected_count ?? null,
    [records]
  )

  // colspan pro prázdný stav: # + timestamp + [group] + akce
  const emptyCols = 3 + (hasGroups ? 1 : 0)

  // ── Production — skupinový graf + podtabulka záznamů ──
  // (Testing se nikdy nerendruje — hlavní řádek Testing má přímé navigate tlačítko)
  return (
    <div className="db-expand">
      {loading && <LoadingSpinner />}
      {error   && <p className="error-text">{error}</p>}

      {!loading && !error && (
        <>
          {/* Přehled skupin — jen production, jen když jsou skupiny v datech */}
          {dataType === 'production' && hasGroups && (
            <div className="db-order-stats">
              <div className="db-group-chart-wrap">
                <div className="db-order-stats__label">{t.db.groupDistribution}</div>
                <ResponsiveContainer width="100%" height={90}>
                  <BarChart data={groupData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {groupData.map((_, idx) => (
                        <Cell key={idx} fill={GROUP_COLORS[idx % GROUP_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {expectedCount != null && (
                <div className="db-count-tile">
                  <div className="db-order-stats__label">{t.db.totalVsExpected}</div>
                  <div className="db-count-tile__values">
                    <span className="db-count-tile__total">{records.length}</span>
                    <span className="db-count-tile__sep">/</span>
                    <span className="db-count-tile__expected">{String(expectedCount)}</span>
                  </div>
                  <div className="db-count-bar-wrap">
                    <div
                      className="db-count-bar"
                      style={{ width: `${Math.min(100, (records.length / Number(expectedCount)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabulka záznamů */}
          <div className="db-subtable-wrap">
            <table className="db-subtable">
              <thead>
                <tr>
                  <th className="db-subtable__th db-subtable__th--num">#</th>
                  <th className="db-subtable__th">{t.db.colTimestamp}</th>
                  {hasGroups && (
                    <th className="db-subtable__th db-subtable__th--center">{t.db.colGroup}</th>
                  )}
                  <th className="db-subtable__th db-subtable__th--actions"></th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr>
                    <td colSpan={emptyCols} className="db-empty">{t.db.noRecords}</td>
                  </tr>
                )}
                {records.map((r, i) => (
                  <tr key={i} className="db-subtable__row" onClick={() => navigate(`${chartUrl}&record=${i}`)}>
                    <td className="db-subtable__td db-subtable__td--num">{i + 1}</td>
                    <td className="db-subtable__td">{String(r.timestamp ?? '—')}</td>
                    {hasGroups && (
                      <td className="db-subtable__td db-subtable__td--center">
                        {r.group != null
                          ? (
                            <span
                              className="db-group-badge"
                              style={{ background: GROUP_COLORS[(Number(r.group) - 1) % GROUP_COLORS.length] }}
                            >
                              {String(r.group)}
                            </span>
                          )
                          : '—'
                        }
                      </td>
                    )}
                    <td className="db-subtable__td db-subtable__td--actions">
                      <button
                        className="db-icon-btn"
                        title={t.db.openInChart}
                        onClick={e => { e.stopPropagation(); navigate(`${chartUrl}&record=${i}`) }}
                      >
                        <BarChart2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="db-expand__footer">
            <div className="db-expand__stats">
              <span>{t.db.rangeRecords}: <strong>{records.length}</strong></span>
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
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// FileTable — hlavní tabulka s řádky, stránkováním a footerem
// ------------------------------------------------------------------

interface Props {
  files:           OrderFile[]
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
  onExpandToggle:  (fileId: string) => void
  onDeleteRequest: (file: OrderFile) => void
  onDownload:      (file: OrderFile) => void
  onPageChange:    (page: number) => void
}

export default function FileTable({
  files, loading, error,
  dataType, location, showSync,
  page, pages, total, totalRecords,
  expandedId, onExpandToggle, onDeleteRequest, onDownload, onPageChange,
}: Props) {
  const { t } = useLang()
  const navigate = useNavigate()

  // colspan: # + created + [order] + switch + records + [sync] + actions
  const colSpan = (dataType === 'production' ? 5 : 4) + (showSync ? 1 : 0) + 1

  return (
    <>
      {loading && files.length === 0 && <LoadingSpinner />}
      {error   && files.length === 0 && <p className="error-text">{error}</p>}

      {(files.length > 0 || (!loading && !error)) && (
        <>
          <table className="db-table">
            <thead>
              <tr>
                <th className="db-th db-th--num">#</th>
                <th className="db-th">{t.db.colCreated}</th>
                {dataType === 'production' && <th className="db-th">{t.db.colOrder}</th>}
                <th className="db-th">{t.db.colSwitchType}</th>
                <th className="db-th db-th--center">{t.db.colRecords}</th>
                {showSync && <th className="db-th db-th--center">{t.db.colSync}</th>}
                <th className="db-th db-th--actions"></th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="db-empty">
                    {location === 'local' ? t.db.noFilesLocal : t.db.noFilesRemote}
                  </td>
                </tr>
              )}
              {files.map((file, i) => (
                <Fragment key={file.file_id}>
                  <tr
                    className={`db-row${expandedId === file.file_id ? ' db-row--expanded' : ''}`}
                    onClick={dataType === 'production'
                      ? () => onExpandToggle(file.file_id)
                      : () => navigate(`/chart?file=${encodeURIComponent(file.file_id)}&location=${location}&type=${dataType}`)
                    }
                  >
                    <td className="db-td db-td--num">{i + 1}</td>
                    <td className="db-td">{formatDateTime(file.created_at)}</td>
                    {dataType === 'production' && (
                      <td className="db-td db-td--mono">{file.order_id ?? '—'}</td>
                    )}
                    <td className="db-td">{file.switch_name}</td>
                    <td className="db-td db-td--center">
                      <span className="db-badge">{file.record_count}</span>
                    </td>
                    {showSync && (
                      <td className="db-td db-td--center">
                        {file.sync_status === 'done_remote'
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
                      <button
                        className="db-icon-btn"
                        title={t.chart.exportCsv}
                        onClick={() => onDownload(file)}
                      >
                        <Download size={18} />
                      </button>
                      <button
                        className="db-icon-btn db-icon-btn--danger"
                        title={t.common.delete}
                        onClick={() => onDeleteRequest(file)}
                      >
                        <Trash2 size={18} />
                      </button>
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
              ))}
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
