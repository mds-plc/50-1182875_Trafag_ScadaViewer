/**
 * @file Database.tsx
 * @description Stránka prohlížeče databáze CSV souborů (/database) — tenký container.
 *   Veškerá logika (state, data fetching, auto-refresh, klávesové zkratky)
 *   je v hooku useDatabaseState. Tabulka v FileTable, dialog smazání v DeleteModal.
 */
import { HardDrive, Server, RefreshCw, WifiOff, X } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useDatabaseState } from '../hooks/useDatabaseState'
import FileTable  from '../components/FileTable'
import DeleteModal from '../components/DeleteModal'

/**
 * Stránka prohlížeče CSV databáze (/database) — tenký presentační container.
 * Veškerá logika (state, fetch, auto-refresh, klávesové zkratky) je v useDatabaseState.
 */
export default function Database() {
  const { t } = useLang()
  const {
    location, setLocation,
    dataType, setDataType,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    page,     setPage,
    expandedId,   setExpandedId,
    deleteTarget, setDeleteTarget,
    files, total, pages, loading, error, fetchFiles,
    remoteAvailable,
    showSync, totalRecords,
    deleteFile, downloadCsv,
  } = useDatabaseState()

  return (
    <div className="db-page">

      {/* Hlavička + přepínače */}
      <div className="db-header">
        <h1 className="page-title">{t.db.title}</h1>
        <div className="db-controls">

          {/* Local / Remote */}
          <div className="db-tabs">
            <button
              className={`db-tab${location === 'local' ? ' db-tab--active' : ''}`}
              onClick={() => setLocation('local')}
            >
              <HardDrive size={13} /> {t.db.tabLocal}
            </button>
            <button
              className={`db-tab${location === 'remote' ? ' db-tab--active' : ''}`}
              onClick={() => setLocation('remote')}
            >
              <Server size={13} /> {t.db.tabRemote}
              <span className={`db-remote-dot${
                remoteAvailable === null ? ' db-remote-dot--unknown' :
                remoteAvailable          ? ' db-remote-dot--ok'      :
                                           ' db-remote-dot--err'
              }`} title={
                remoteAvailable === null ? t.db.dotChecking :
                remoteAvailable          ? t.db.dotAvailable :
                                           t.db.dotUnavailable
              } />
            </button>
          </div>

          {/* Production / Testing */}
          <div className="db-tabs">
            <button
              className={`db-tab${dataType === 'production' ? ' db-tab--active' : ''}`}
              onClick={() => setDataType('production')}
            >
              {t.db.tabProduction}
            </button>
            <button
              className={`db-tab${dataType === 'testing' ? ' db-tab--active' : ''}`}
              onClick={() => setDataType('testing')}
            >
              {t.db.tabTesting}
            </button>
          </div>

          {/* Ruční refresh */}
          <button
            className={`db-refresh-btn${loading ? ' db-refresh-btn--spinning' : ''}`}
            onClick={fetchFiles}
            title={t.common.refresh}
            disabled={loading}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Banner — vzdálené úložiště nedostupné */}
      {location === 'remote' && remoteAvailable === false && (
        <div className="db-remote-alert">
          <WifiOff size={16} />
          <span>{t.db.remoteUnavailable}</span>
        </div>
      )}

      {/* Tabulka + toolbar */}
      <div className="tile tile--12">
        <div className="db-toolbar">
          <span className="filter-bar__label">{t.common.from}</span>
          <input
            type="date"
            className="filter-bar__input"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <span className="filter-bar__label">{t.common.to}</span>
          <input
            type="date"
            className="filter-bar__input"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
          {(dateFrom || dateTo) && (
            <button className="db-clear-btn" onClick={() => { setDateFrom(''); setDateTo('') }}>
              <X size={13} /> {t.db.clearFilter}
            </button>
          )}
        </div>

        <FileTable
          files={files}
          loading={loading}
          error={error}
          dataType={dataType}
          location={location}
          showSync={showSync}
          page={page}
          pages={pages}
          total={total}
          totalRecords={totalRecords}
          expandedId={expandedId}
          onExpandToggle={id => setExpandedId(prev => prev === id ? null : id)}
          onDeleteRequest={file => setDeleteTarget(file)}
          onDownload={file => { void downloadCsv(file) }}
          onPageChange={setPage}
        />
      </div>

      {/* Potvrzovací dialog smazání */}
      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { void deleteFile(deleteTarget) }}
        />
      )}
    </div>
  )
}
