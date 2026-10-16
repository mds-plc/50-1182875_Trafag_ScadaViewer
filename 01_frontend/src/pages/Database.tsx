/**
 * @file Database.tsx
 * @description Stránka prohlížeče databáze CSV souborů (/database) — tenký container.
 *   Veškerá logika (state, data fetching, auto-refresh, klávesové zkratky)
 *   je v hooku useDatabaseState. Tabulka v FileTable, dialog smazání v DeleteModal.
 *   Lišta nad tabulkou: hledání zakázky (jen Production; během hledání se datumový filtr
 *   neuplatní — architecture.md fáze 47) + datumový filtr.
 */
import { HardDrive, Server, RefreshCw, WifiOff, X, Search } from 'lucide-react'
import { useLang } from '../context/LangContext'
import { useDatabaseState } from '../hooks/useDatabaseState'
import FileTable  from '../components/FileTable'
import DeleteModal from '../components/DeleteModal'
import PageHelp from '../components/PageHelp'
import StorageBar  from '../components/StorageBar'
import NasStorageBar from '../components/NasStorageBar'

/**
 * Stránka prohlížeče CSV databáze (/database) — tenký presentační container.
 * Veškerá logika (state, fetch, auto-refresh, klávesové zkratky) je v useDatabaseState.
 */
export default function Database() {
  const { t } = useLang()
  const {
    location, setLocation,
    dataType, setDataType,
    dateFrom, setDateFrom, showDaysUntil,
    dateTo,   setDateTo,
    page,     setPage,
    expandedId,   setExpandedId,
    deleteTarget, setDeleteTarget, canDeleteUnsynced,
    searchInput, setSearchInput, searchQuery, searchAllDates,
    sortBy, sortDir, onSort,
    files, wip, hiddenByFilter, latestCreatedAt, total, pages, loading, error, fetchFiles,
    remoteAvailable,
    showSync, totalRecords, readOnly,
    deleteFile, downloadCsv, downloadXlsx,
    selectedIds, toggleSelect, selectAll, clearSelect, batchDelete, batchConfirm, setBatchConfirm,
  } = useDatabaseState()
  const selectedUnsynced = files.filter(f => selectedIds.has(f.file_id) && f.sync_status === 'done_local').length

  return (
    <div className="db-page">

      {/* Hlavička + přepínače */}
      <div className="db-header">
        <h1 className="page-title">{t.db.title}<PageHelp page="database" /></h1>
        <div className="db-controls">

          {/* Zaplnění lokálního úložiště + vyčištění synchronizovaných (obě záložky) */}
          <StorageBar readOnly={readOnly} />
          {/* Zaplnění NAS (zbývající místo, varování 80 / 95 %) — vždy vedle lokálního úložiště */}
          <NasStorageBar />

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
          {/* Hledání zakázky podle čísla / názvu — filtruje server (stránkování i počty sedí) */}
          {dataType === 'production' && (
            <div className="db-search">
              <Search size={14} className="db-search__icon" aria-hidden="true" />
              <input
                type="search"
                className="filter-bar__input db-search__input"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearchInput('') }}
                placeholder={t.db.searchOrder}
                aria-label={t.db.searchOrder}
                maxLength={100}
                spellCheck={false}
                autoComplete="off"
              />
              {searchInput && (
                <button type="button" className="db-search__clear" onClick={() => setSearchInput('')}
                        title={t.db.searchClear} aria-label={t.db.searchClear}>
                  <X size={14} />
                </button>
              )}
            </div>
          )}
          {/* Během hledání se datumový filtr neuplatní (hledá se ve všech datech) — pole zůstanou
              nastavená a po vymazání hledání platí zase */}
          <div className={`db-date-filter${searchAllDates ? ' db-date-filter--suspended' : ''}`}>
            <span className="filter-bar__label">{t.common.from}</span>
            <input
              type="date"
              className="filter-bar__input"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              disabled={searchAllDates}
            />
            <span className="filter-bar__label">{t.common.to}</span>
            <input
              type="date"
              className="filter-bar__input"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              disabled={searchAllDates}
            />
            {(dateFrom || dateTo) && !searchAllDates && (
              <button className="db-clear-btn" onClick={() => { setDateFrom(''); setDateTo('') }}>
                <X size={13} /> {t.db.clearFilter}
              </button>
            )}
          </div>
          {searchAllDates && <span className="db-search__note">{t.db.searchAllDates}</span>}
        </div>

        <FileTable
          files={files}
          wip={page === 1 ? wip : []}
          hiddenByFilter={hiddenByFilter}
          searchQuery={searchQuery}
          latestCreatedAt={latestCreatedAt}
          onShowLatestDay={showDaysUntil}
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
          onDownloadXlsx={file => { void downloadXlsx(file) }}
          onPageChange={setPage}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onClearSelect={clearSelect}
          onBatchDelete={() => setBatchConfirm(true)}
          readOnly={readOnly}
          canDeleteWip={canDeleteUnsynced}
        />
      </div>

      {/* Potvrzovací dialog smazání */}
      {deleteTarget && (
        <DeleteModal
          target={deleteTarget}
          canDeleteUnsynced={canDeleteUnsynced}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => { void deleteFile(deleteTarget) }}
        />
      )}

      {/* Potvrzovací dialog hromadného smazání */}
      {batchConfirm && (
        <div className="db-overlay" onClick={() => setBatchConfirm(false)}>
          <div className="db-modal" onClick={e => e.stopPropagation()}>
            <div className="db-modal__title">{t.db.batchConfirmTitle}</div>
            <div className="db-modal__body">
              {t.db.batchConfirmBody}
              <div style={{ marginTop: 'var(--space-3)', fontWeight: 600 }}>
                {t.db.selectedCount}: {selectedIds.size}
              </div>
              {/* Názvy, ne jen počet — obsluha vidí, co přesně maže (audit F1) */}
              <ul className="db-modal__list">
                {[...selectedIds].map(id => <li key={id}>{id}</li>)}
              </ul>
              {/* Soubory, které ještě nejsou na NAS — jediná kopie dat (audit Q5) */}
              {selectedUnsynced > 0 && (
                <p className="db-modal__warning" role="alert">
                  {t.db.batchUnsyncedCount}: {selectedUnsynced}
                </p>
              )}
            </div>
            <div className="db-modal__actions">
              <button className="btn btn--secondary" onClick={() => setBatchConfirm(false)}>
                {t.common.cancel}
              </button>
              <button className="btn btn--danger" onClick={() => { void batchDelete() }}>
                {t.db.deleteSelected}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
