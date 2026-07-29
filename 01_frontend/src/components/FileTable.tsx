/**
 * @file FileTable.tsx
 * @description Tabulka CSV souborů stránky Database — řádky, rozbalené záznamy
 *   (ExpandedRow), stránkování a footer se součty.
 *   Čistá prezentační komponenta — veškerá logika žije v useDatabaseState.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Trash2, BarChart2, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useFileRecords, RECORDS_PER_PAGE } from '../hooks/useData'
import { useLang } from '../context/LangContext'
import LoadingSpinner from './LoadingSpinner'
import Pagination from './Pagination'
import { formatDateTime } from '../utils/formatting'
import type { OrderFile } from '../types'
import type { Location, DataType } from '../hooks/useDatabaseState'

const GROUP_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

/** Všechny měřené parametry se zkratkami, jednotkami a anglickým popisem (tooltip). */
interface ExpandParam { key: string; label: string; unit: string; description: string }

const EXPAND_PARAMS: ExpandParam[] = [
  // Forces
  { key: 'of_operatingforce',          label: 'OF',   unit: 'N',  description: 'Operating Force'               },
  { key: 'rf_realisingforce',          label: 'RF',   unit: 'N',  description: 'Realising Force'               },
  { key: 'ttf_totaltravelforce',       label: 'TTF',  unit: 'N',  description: 'Total Travel Force'            },
  // Distances
  { key: 'pt_pretravel',               label: 'PT',   unit: 'mm', description: 'Pre-travel'                    },
  { key: 'ot_overtravel',              label: 'OvT',  unit: 'mm', description: 'Overtravel'                    },
  { key: 'rt_realisingtravel',         label: 'RvT',  unit: 'mm', description: 'Realising Travel'              },
  { key: 'md_movementdifferential',    label: 'MD',   unit: 'mm', description: 'Movement Differential'         },
  { key: 'tt_totaltravel',             label: 'TT',   unit: 'mm', description: 'Total Travel'                  },
  { key: 'fp_freeposition',            label: 'FP',   unit: 'mm', description: 'Free Position'                 },
  { key: 'op_operatingposition',       label: 'OP',   unit: 'mm', description: 'Operating Position'            },
  { key: 'rp_realeasingposition',      label: 'RP',   unit: 'mm', description: 'Releasing Position'            },
  { key: 'ttp_totaltravelposition',    label: 'TTP',  unit: 'mm', description: 'Total Travel Position'         },
  // Times
  { key: 'ut_unstabletime',            label: 'UT',   unit: 'ms', description: 'Unstable Time'                 },
  { key: 'rt_reversetime',             label: 'RevT', unit: 'ms', description: 'Reverse Time'                  },
  { key: 'bt_bouncetime',              label: 'BT',   unit: 'ms', description: 'Bounce Time'                   },
  { key: 'ot_operatingtime',           label: 'OpT',  unit: 'ms', description: 'Operating Time'                },
  // Contacts — 999.9 = sensor not connected → filtered (value > 500)
  { key: 'r_nc_operatingposition_neg', label: 'NCo−', unit: 'mΩ', description: 'NC — Operating Position Neg'  },
  { key: 'r_nc_operatingposition_pos', label: 'NCo+', unit: 'mΩ', description: 'NC — Operating Position Pos'  },
  { key: 'r_nc_releasingposition_neg', label: 'NCr−', unit: 'mΩ', description: 'NC — Releasing Position Neg'  },
  { key: 'r_nc_releasingposition_pos', label: 'NCr+', unit: 'mΩ', description: 'NC — Releasing Position Pos'  },
  { key: 'r_no_operatingposition_neg', label: 'NOo−', unit: 'mΩ', description: 'NO — Operating Position Neg'  },
  { key: 'r_no_operatingposition_pos', label: 'NOo+', unit: 'mΩ', description: 'NO — Operating Position Pos'  },
  { key: 'r_no_releasingposition_neg', label: 'NOr−', unit: 'mΩ', description: 'NO — Releasing Position Neg'  },
  { key: 'r_no_releasingposition_pos', label: 'NOr+', unit: 'mΩ', description: 'NO — Releasing Position Pos'  },
]

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

  // Načtení dat (production) při změně stránky
  useEffect(() => {
    if (dataType === 'production') {
      fetchRecords(file.file_id, location, dataType, recordPage)
    }
  }, [file.file_id, location, dataType, recordPage, fetchRecords])

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

  // Měřené parametry — zobrazit jen ty, které existují a mají platnou hodnotu (≤ 500, 999.9 = senzor off)
  const activeParams = useMemo(() => EXPAND_PARAMS.filter(p =>
    records.some(r => {
      const v = String(r[p.key] ?? '')
      const n = Number(v)
      return v !== '' && !isNaN(n) && n <= 500
    })
  ), [records])

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
                  {hasStatusCol   && <th className="db-subtable__th db-subtable__th--center">STATUS</th>}
                  {hasCategoryCol && <th className="db-subtable__th db-subtable__th--center">KAT.</th>}
                  {activeParams.map(p => (
                    <th
                      key={p.key}
                      className="db-subtable__th db-subtable__th--param"
                      onClick={() => setTooltipKey(tooltipKey === p.key ? null : p.key)}
                    >
                      {p.label}<br /><span className="db-subtable__unit">{p.unit}</span>
                      {tooltipKey === p.key && (
                        <div className="db-param-tooltip">{p.description} [{p.unit}]</div>
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
                    <td className="db-subtable__td">{String(r.timestamp ?? '—')}</td>
                    {hasGroupCol && (
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
                    {activeParams.map(p => (
                      <td key={p.key} className="db-subtable__td db-subtable__td--param">
                        {r[p.key] != null && String(r[p.key]) !== '' ? String(r[p.key]) : '—'}
                      </td>
                    ))}
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
