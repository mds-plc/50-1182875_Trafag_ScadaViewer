import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @file Database.tsx
 * @description Stránka prohlížeče databáze CSV souborů (/database) — tenký container.
 *   Veškerá logika (state, data fetching, auto-refresh, klávesové zkratky)
 *   je v hooku useDatabaseState. Tabulka v FileTable, dialog smazání v DeleteModal.
 */
import { HardDrive, Server, RefreshCw, WifiOff, X } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useDatabaseState } from '../hooks/useDatabaseState';
import FileTable from '../components/FileTable';
import DeleteModal from '../components/DeleteModal';
/**
 * Stránka prohlížeče CSV databáze (/database) — tenký presentační container.
 * Veškerá logika (state, fetch, auto-refresh, klávesové zkratky) je v useDatabaseState.
 */
export default function Database() {
    const { t } = useLang();
    const { location, setLocation, dataType, setDataType, dateFrom, setDateFrom, dateTo, setDateTo, page, setPage, expandedId, setExpandedId, deleteTarget, setDeleteTarget, files, total, pages, loading, error, fetchFiles, remoteAvailable, showSync, totalRecords, deleteFile, downloadCsv, } = useDatabaseState();
    return (_jsxs("div", { className: "db-page", children: [_jsxs("div", { className: "db-header", children: [_jsx("h1", { className: "page-title", children: t.db.title }), _jsxs("div", { className: "db-controls", children: [_jsxs("div", { className: "db-tabs", children: [_jsxs("button", { className: `db-tab${location === 'local' ? ' db-tab--active' : ''}`, onClick: () => setLocation('local'), children: [_jsx(HardDrive, { size: 13 }), " ", t.db.tabLocal] }), _jsxs("button", { className: `db-tab${location === 'remote' ? ' db-tab--active' : ''}`, onClick: () => setLocation('remote'), children: [_jsx(Server, { size: 13 }), " ", t.db.tabRemote, _jsx("span", { className: `db-remote-dot${remoteAvailable === null ? ' db-remote-dot--unknown' :
                                                    remoteAvailable ? ' db-remote-dot--ok' :
                                                        ' db-remote-dot--err'}`, title: remoteAvailable === null ? t.db.dotChecking :
                                                    remoteAvailable ? t.db.dotAvailable :
                                                        t.db.dotUnavailable })] })] }), _jsxs("div", { className: "db-tabs", children: [_jsx("button", { className: `db-tab${dataType === 'production' ? ' db-tab--active' : ''}`, onClick: () => setDataType('production'), children: t.db.tabProduction }), _jsx("button", { className: `db-tab${dataType === 'testing' ? ' db-tab--active' : ''}`, onClick: () => setDataType('testing'), children: t.db.tabTesting })] }), _jsx("button", { className: `db-refresh-btn${loading ? ' db-refresh-btn--spinning' : ''}`, onClick: fetchFiles, title: t.common.refresh, disabled: loading, children: _jsx(RefreshCw, { size: 14 }) })] })] }), location === 'remote' && remoteAvailable === false && (_jsxs("div", { className: "db-remote-alert", children: [_jsx(WifiOff, { size: 16 }), _jsx("span", { children: t.db.remoteUnavailable })] })), _jsxs("div", { className: "tile tile--12", children: [_jsxs("div", { className: "db-toolbar", children: [_jsx("span", { className: "filter-bar__label", children: t.common.from }), _jsx("input", { type: "date", className: "filter-bar__input", value: dateFrom, onChange: e => setDateFrom(e.target.value) }), _jsx("span", { className: "filter-bar__label", children: t.common.to }), _jsx("input", { type: "date", className: "filter-bar__input", value: dateTo, onChange: e => setDateTo(e.target.value) }), (dateFrom || dateTo) && (_jsxs("button", { className: "db-clear-btn", onClick: () => { setDateFrom(''); setDateTo(''); }, children: [_jsx(X, { size: 13 }), " ", t.db.clearFilter] }))] }), _jsx(FileTable, { files: files, loading: loading, error: error, dataType: dataType, location: location, showSync: showSync, page: page, pages: pages, total: total, totalRecords: totalRecords, expandedId: expandedId, onExpandToggle: id => setExpandedId(prev => prev === id ? null : id), onDeleteRequest: file => setDeleteTarget(file), onDownload: file => { void downloadCsv(file); }, onPageChange: setPage })] }), deleteTarget && (_jsx(DeleteModal, { target: deleteTarget, onCancel: () => setDeleteTarget(null), onConfirm: () => { void deleteFile(deleteTarget); } }))] }));
}
