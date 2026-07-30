/**
 * @file Settings.tsx
 * @description Stránka nastavení — záložky Předvolby / Připojení.
 *   Každý parametr má tlačítko s nápovědou (popup).
 *   Připojení rozděleno na PLC/ADS a Úložiště s editací cest.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, Folder, FolderOpen, HardDrive, Info, Cpu, Network, SlidersHorizontal, Users, X } from 'lucide-react'
import { useLang }     from '../context/LangContext'
import { useToast }    from '../context/ToastContext'
import { useAuth }     from '../context/AuthContext'
import { useTheme }    from '../hooks/useTheme'
import { useSettings } from '../hooks/useSettings'
import LoadingSpinner  from '../components/LoadingSpinner'

// ---------------------------------------------------------------------------
// HelpButton — info tlačítko s výskakovacím popiskem
// ---------------------------------------------------------------------------

interface HelpButtonProps {
  id:          string
  text:        string
  openHelp:    string | null
  setOpenHelp: (id: string | null) => void
}

function HelpButton({ id, text, openHelp, setOpenHelp }: HelpButtonProps) {
  return (
    <div className="settings-help-wrap">
      <button
        className="settings-help-btn"
        aria-label="Nápověda"
        onClick={e => {
          e.stopPropagation()
          setOpenHelp(openHelp === id ? null : id)
        }}
      >
        <Info size={13} />
      </button>
      {openHelp === id && (
        <div className="settings-help-popup">{text}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FolderPickerModal — REST-based výběr složky
// ---------------------------------------------------------------------------

interface FsData {
  path:     string
  parent:   string | null
  children: string[]
}

interface FolderPickerProps {
  initialPath: string
  onSelect:    (path: string) => void
  onClose:     () => void
}

function FolderPickerModal({ initialPath, onSelect, onClose }: FolderPickerProps) {
  const { t } = useLang()
  const [fsData,  setFsData]  = useState<FsData>({ path: '', parent: null, children: [] })
  const [loading, setLoading] = useState(false)
  const fpAbortRef = useRef<AbortController | null>(null)

  const navigate = useCallback(async (newPath: string) => {
    fpAbortRef.current?.abort()
    const ctrl = new AbortController()
    fpAbortRef.current = ctrl
    setLoading(true)
    try {
      const res = await fetch(`/api/config/fs?${new URLSearchParams({ path: newPath })}`, { signal: ctrl.signal })
      if (res.ok) setFsData(await res.json() as FsData)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    navigate(initialPath)
    return () => { fpAbortRef.current?.abort() }
  }, [initialPath, navigate])

  // Zobrazovací název z plné cesty
  function childLabel(fullPath: string): string {
    const parts = fullPath.replace(/\\/g, '/').split('/').filter(Boolean)
    const last  = parts.pop() ?? fullPath
    // Kořen disku: "C:" → "C:/"
    return /^[A-Za-z]:$/.test(last) ? last + '/' : last
  }

  // Breadcrumb segmenty z aktuální cesty
  function buildCrumbs(): Array<{ label: string; navPath: string }> {
    const { path } = fsData
    if (!path) return []
    const parts  = path.replace(/\\/g, '/').split('/').filter(Boolean)
    const result: Array<{ label: string; navPath: string }> = []
    let cur = ''
    parts.forEach((seg, i) => {
      cur = i === 0 ? seg + '/' : cur + seg
      result.push({ label: i === 0 ? seg + '/' : seg, navPath: cur })
      if (i < parts.length - 1) cur += '/'
    })
    return result
  }

  const { path, children } = fsData
  const crumbs = buildCrumbs()

  return (
    <div className="settings-fp-overlay" onClick={onClose}>
      <div className="settings-fp-modal" onClick={e => e.stopPropagation()}>

        {/* Záhlaví */}
        <div className="settings-fp-header">
          <span className="settings-fp-title">{t.settings.connBrowse}</span>
          <button className="settings-fp-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Breadcrumb */}
        <div className="settings-fp-breadcrumb">
          <button
            className={`settings-fp-crumb${!path ? ' settings-fp-crumb--current' : ''}`}
            onClick={() => { if (path) navigate('') }}
          >
            <HardDrive size={12} />
            {t.settings.connPickerDrives}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.navPath} className="settings-fp-crumb-row">
              <ChevronRight size={11} className="settings-fp-arrow" />
              <button
                className={`settings-fp-crumb${i === crumbs.length - 1 ? ' settings-fp-crumb--current' : ''}`}
                onClick={() => { if (i < crumbs.length - 1) navigate(c.navPath) }}
              >{c.label}</button>
            </span>
          ))}
        </div>

        {/* Seznam složek */}
        <div className="settings-fp-list">
          {loading && <div className="settings-fp-status">…</div>}
          {!loading && children.length === 0 && (
            <div className="settings-fp-status">{t.settings.connPickerEmpty}</div>
          )}
          {!loading && children.map(child => (
            <button key={child} className="settings-fp-item" onClick={() => navigate(child)}>
              <Folder size={14} />
              <span>{childLabel(child)}</span>
            </button>
          ))}
        </div>

        {/* Zápatí */}
        <div className="settings-fp-footer">
          <button className="btn btn--secondary btn--sm" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button
            className="btn btn--primary btn--sm"
            disabled={!path}
            onClick={() => { onSelect(path); onClose() }}
          >
            {t.settings.connPickerSelect}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

interface HealthData {
  status:  'ok' | 'degraded'
  checks:  { local_storage: boolean; ads: boolean }
}

interface ConfigData {
  server: { version: string }
  ads:    { net_id: string; port: number }
  data:   { local_path: string; remote_path: string }
}

interface StatusData {
  remote_available: boolean
}

type Tab = 'preferences' | 'connection' | 'users'

// ---------------------------------------------------------------------------
// UsersTab — správa uživatelů (admin+)
// ---------------------------------------------------------------------------

interface UserEntry {
  username:     string
  display_name: string
  role:         string
}

interface UsersTabProps {
  token: string | null
}

function UsersTab({ token }: UsersTabProps) {
  const { t }         = useLang()
  const { addToast }  = useToast()
  const { username: selfUsername, role: selfRole } = useAuth()

  const ROLE_LEVELS: Record<string, number> = {
    operator: 0, technician: 1, admin: 2, manufacturer: 3,
  }
  const ROLE_LABELS: Record<string, string> = {
    operator:     t.users.roleOperator,
    technician:   t.users.roleTechnician,
    admin:        t.users.roleAdmin,
    manufacturer: t.users.roleManufacturer,
  }
  const selfLevel = ROLE_LEVELS[selfRole ?? 'operator'] ?? 0

  const [users,   setUsers]   = useState<UserEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const fetchAbortRef = useRef<AbortController | null>(null)

  // Formulář přidání uživatele
  const [newUsername,    setNewUsername]    = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole,        setNewRole]        = useState('operator')
  const [newPassword,    setNewPassword]    = useState('')
  const [addBusy,        setAddBusy]        = useState(false)

  // Inline změna hesla
  const [pwdTarget,   setPwdTarget]   = useState<string | null>(null)
  const [pwdValue,    setPwdValue]    = useState('')
  const [pwdCurrent,  setPwdCurrent]  = useState('')
  const [pwdBusy,     setPwdBusy]     = useState(false)

  const authHeaders = useCallback((): HeadersInit => {
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }, [token])

  const fetchUsers = useCallback(async () => {
    fetchAbortRef.current?.abort()
    const ctrl = new AbortController()
    fetchAbortRef.current = ctrl
    setLoading(true)
    try {
      const res = await fetch('/api/users', { headers: authHeaders(), signal: ctrl.signal })
      if (res.ok) setUsers(await res.json() as UserEntry[])
      setLoading(false)
    } catch (e) {
      if (ctrl.signal.aborted) return
      setLoading(false)
    }
  }, [authHeaders])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleAdd() {
    if (!newUsername.trim() || !newPassword.trim()) {
      addToast(t.users.errEmptyField, 'warning')
      return
    }
    setAddBusy(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          username:     newUsername.trim(),
          display_name: newDisplayName.trim() || newUsername.trim(),
          password:     newPassword,
          role:         newRole,
        }),
      })
      if (res.status === 409) { addToast(t.users.errUserExists, 'danger'); return }
      if (res.status === 403) { addToast(t.users.errHigherRole, 'danger');  return }
      if (!res.ok)             { addToast(t.common.errorLoading, 'danger'); return }
      addToast(t.users.successAdded, 'success')
      setNewUsername(''); setNewDisplayName(''); setNewPassword(''); setNewRole('operator')
      await fetchUsers()
    } finally {
      setAddBusy(false)
    }
  }

  async function handleDelete(username: string) {
    if (confirmDelete !== username) { setConfirmDelete(username); return }
    setConfirmDelete(null)
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (res.status === 400) { addToast(t.users.errLastUser, 'danger');  return }
    if (res.status === 403) { addToast(t.users.errSelf,     'danger');  return }
    if (!res.ok)             { addToast(t.common.errorLoading, 'danger'); return }
    addToast(t.users.successDeleted, 'success')
    await fetchUsers()
  }

  async function handleChangePwd(username: string) {
    if (!pwdValue.trim()) { addToast(t.users.errEmptyField, 'warning'); return }
    setPwdBusy(true)
    try {
      const isSelf = username === selfUsername
      const body: Record<string, string> = { new_password: pwdValue }
      if (isSelf) body.current_password = pwdCurrent
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/password`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      if (res.status === 401) { addToast(t.settings.accountPwdWrong, 'danger'); return }
      if (!res.ok)             { addToast(t.common.errorLoading, 'danger');      return }
      addToast(t.users.successPassword, 'success')
      setPwdTarget(null); setPwdValue(''); setPwdCurrent('')
    } finally {
      setPwdBusy(false)
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      {/* Seznam uživatelů */}
      <table className="data-table" style={{ marginBottom: 'var(--space-6)' }}>
        <thead>
          <tr>
            <th className="data-table__th">{t.users.username}</th>
            <th className="data-table__th">{t.users.displayName}</th>
            <th className="data-table__th">{t.users.role}</th>
            <th className="data-table__th" style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 && (
            <tr><td colSpan={4} className="data-table__td" style={{ textAlign: 'center' }}>{t.users.noUsers}</td></tr>
          )}
          {users.map(u => (
            <>
              <tr key={u.username}>
                <td className="data-table__td">{u.username}</td>
                <td className="data-table__td">{u.display_name}</td>
                <td className="data-table__td">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="data-table__td" style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn btn--secondary btn--sm"
                    style={{ marginRight: 'var(--space-2)' }}
                    onClick={() => {
                      setPwdTarget(pwdTarget === u.username ? null : u.username)
                      setPwdValue(''); setPwdCurrent('')
                    }}
                  >{t.users.changePassword}</button>
                  {/* Smazat — jen pokud má admin vyšší roli než cíl */}
                  {(ROLE_LEVELS[selfRole ?? ''] ?? 0) > (ROLE_LEVELS[u.role] ?? 0) && (
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={() => handleDelete(u.username)}
                    >
                      {confirmDelete === u.username ? t.users.deleteConfirm : t.users.deleteUser}
                    </button>
                  )}
                </td>
              </tr>
              {pwdTarget === u.username && (
                <tr key={`${u.username}-pwd`}>
                  <td colSpan={4} className="data-table__td" style={{ background: 'var(--color-surface-2)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                      {u.username === selfUsername && (
                        <input
                          className="settings-path-input"
                          type="password"
                          placeholder={t.users.currentPassword}
                          value={pwdCurrent}
                          onChange={e => setPwdCurrent(e.target.value)}
                          style={{ width: 160 }}
                        />
                      )}
                      <input
                        className="settings-path-input"
                        type="password"
                        placeholder={t.users.newPassword}
                        value={pwdValue}
                        onChange={e => setPwdValue(e.target.value)}
                        style={{ width: 160 }}
                      />
                      <button
                        className="btn btn--primary btn--sm"
                        disabled={pwdBusy}
                        onClick={() => handleChangePwd(u.username)}
                      >{t.settings.accountSave}</button>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => { setPwdTarget(null); setPwdValue(''); setPwdCurrent('') }}
                      >{t.common.cancel}</button>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {/* Přidat uživatele */}
      <div className="settings-section-header settings-section-header--first">
        <Users size={13} />
        {t.users.addUser}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t.users.username}</div>
          <input
            className="settings-path-input"
            placeholder={t.users.username}
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t.users.displayName}</div>
          <input
            className="settings-path-input"
            placeholder={t.users.displayName}
            value={newDisplayName}
            onChange={e => setNewDisplayName(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t.users.role}</div>
          <select
            className="settings-path-input"
            value={newRole}
            onChange={e => setNewRole(e.target.value)}
            style={{ width: 130 }}
          >
            {Object.entries(ROLE_LABELS)
              .filter(([role]) => (ROLE_LEVELS[role] ?? 0) <= selfLevel)
              .map(([role, label]) => (
                <option key={role} value={role}>{label}</option>
              ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 2 }}>{t.users.password}</div>
          <input
            className="settings-path-input"
            type="password"
            placeholder={t.users.password}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            style={{ width: 140 }}
          />
        </div>
        <button
          className="btn btn--primary btn--sm"
          disabled={addBusy}
          onClick={handleAdd}
          style={{ alignSelf: 'flex-end' }}
        >{t.users.addUserBtn}</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Komponenta Settings
// ---------------------------------------------------------------------------

export default function Settings() {
  const { lang, setLang, t } = useLang()
  const { addToast }         = useToast()
  const { dark, toggle: toggleTheme } = useTheme()
  const { perPage, setPerPage, refreshMs, setRefreshMs } = useSettings()
  const { token, role } = useAuth()

  const isAdmin = ['admin', 'manufacturer'].includes(role ?? '')

  const [activeTab, setActiveTab] = useState<Tab>('preferences')
  const [openHelp,  setOpenHelp]  = useState<string | null>(null)

  const [health,  setHealth]  = useState<HealthData | null>(null)
  const [config,  setConfig]  = useState<ConfigData | null>(null)
  const [status,  setStatus]  = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  const [localPath,      setLocalPath]      = useState('')
  const [remotePath,     setRemotePath]     = useState('')
  const [pathBusy,       setPathBusy]       = useState(false)
  const [pickerOpen,     setPickerOpen]     = useState(false)
  const [statusChecking, setStatusChecking] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Zavřít popup kliknutím kdekoliv jinam
  useEffect(() => {
    if (!openHelp) return
    const close = () => setOpenHelp(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openHelp])

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    const authHdr: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}
    try {
      // health + config jsou rychlé — stránka se zobrazí okamžitě
      const [hRes, cRes] = await Promise.all([
        fetch('/api/health', { signal: ctrl.signal }),
        fetch('/api/config', { signal: ctrl.signal, headers: authHdr }),
      ])
      if (ctrl.signal.aborted) return
      const [h, c] = await Promise.all([hRes.json(), cRes.json()])
      setHealth(h as HealthData)
      setConfig(c as ConfigData)
    } catch (e) {
      if (ctrl.signal.aborted) return
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }

    // /api/status kontroluje NAS (UNC cesta, až 3 s) — načítáme na pozadí
    // nezablokuje zobrazení stránky
    if (abortRef.current?.signal.aborted) return
    setStatusChecking(true)
    fetch('/api/status', { signal: abortRef.current?.signal, headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then((data: StatusData | null) => { if (data) setStatus(data) })
      .catch(() => {})
      .finally(() => setStatusChecking(false))
  }, [token])

  useEffect(() => {
    fetchAll()
    return () => { abortRef.current?.abort() }
  }, [fetchAll])

  useEffect(() => {
    if (config) {
      setLocalPath(config.data.local_path)
      setRemotePath(config.data.remote_path)
    }
  }, [config])

  // ---------------------------------------------------------------------------
  // Uložení cest
  // ---------------------------------------------------------------------------

  async function handleSavePath() {
    setPathBusy(true)
    try {
      const res = await fetch('/api/config/paths', {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body:    JSON.stringify({ local_path: localPath, remote_path: remotePath }),
      })
      if (res.ok) {
        addToast(t.settings.connPathSaved, 'success')
        // Po uložení okamžitě ověř dostupnost vzdáleného úložiště
        setStatus(null)
        setStatusChecking(true)
        fetch('/api/status', { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
          .then(r => r.ok ? r.json() : null)
          .then((data: StatusData | null) => { if (data) setStatus(data) })
          .catch(() => {})
          .finally(() => setStatusChecking(false))
      } else {
        addToast(t.settings.connPathError, 'danger')
      }
    } catch {
      addToast(t.settings.connPathError, 'danger')
    } finally {
      setPathBusy(false)
    }
  }

  function StatusDot({ ok }: { ok: boolean }) {
    return <span className={`settings-status__dot settings-status__dot--${ok ? 'ok' : 'error'}`} />
  }

  // Help props shorthand
  const hp = { openHelp, setOpenHelp }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="db-page">
        <div className="db-header">
          <h1 className="page-title">{t.settings.title}</h1>
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="db-page">

      {/* Hlavička — nadpis vlevo, záložky s ikonkami vpravo */}
      <div className="db-header">
        <h1 className="page-title">{t.settings.title}</h1>
        <div className="db-tabs">
          <button
            className={`db-tab${activeTab === 'preferences' ? ' db-tab--active' : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            <SlidersHorizontal size={13} />
            {t.settings.prefsTile}
          </button>
          <button
            className={`db-tab${activeTab === 'connection' ? ' db-tab--active' : ''}`}
            onClick={() => setActiveTab('connection')}
          >
            <Network size={13} />
            {t.settings.connTile}
          </button>
          {isAdmin && (
            <button
              className={`db-tab${activeTab === 'users' ? ' db-tab--active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={13} />
              {t.users.title}
            </button>
          )}
        </div>
      </div>

      <div className="tile tile--12">

        {/* ── Předvolby ── */}
        {activeTab === 'preferences' && (
          <>
            <div className="settings-row">
              <span className="settings-row__label">{t.settings.prefsLang}</span>
              <div className="settings-row__control">
                <div className="settings-toggle-group">
                  <button
                    className={`settings-toggle-btn${lang === 'cs' ? ' settings-toggle-btn--active' : ''}`}
                    onClick={() => setLang('cs')}
                  >CS</button>
                  <button
                    className={`settings-toggle-btn${lang === 'en' ? ' settings-toggle-btn--active' : ''}`}
                    onClick={() => setLang('en')}
                  >EN</button>
                </div>
              </div>
              <HelpButton id="lang" text={t.settings.helpLang} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.prefsTheme}</span>
              <div className="settings-row__control">
                <div className="settings-toggle-group">
                  <button
                    className={`settings-toggle-btn${dark ? ' settings-toggle-btn--active' : ''}`}
                    onClick={() => { if (!dark) toggleTheme() }}
                  >{t.settings.prefsThemeDark}</button>
                  <button
                    className={`settings-toggle-btn${!dark ? ' settings-toggle-btn--active' : ''}`}
                    onClick={() => { if (dark) toggleTheme() }}
                  >{t.settings.prefsThemeLight}</button>
                </div>
              </div>
              <HelpButton id="theme" text={t.settings.helpTheme} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.prefsPerPage}</span>
              <div className="settings-row__control">
                <div className="settings-toggle-group">
                  {[10, 25, 50].map(n => (
                    <button
                      key={n}
                      className={`settings-toggle-btn${perPage === n ? ' settings-toggle-btn--active' : ''}`}
                      onClick={() => setPerPage(n)}
                    >{n}</button>
                  ))}
                </div>
              </div>
              <HelpButton id="perPage" text={t.settings.helpPerPage} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.prefsRefresh}</span>
              <div className="settings-row__control">
                <div className="settings-toggle-group">
                  {[{ label: '15 s', value: 15_000 }, { label: '30 s', value: 30_000 }, { label: '60 s', value: 60_000 }].map(o => (
                    <button
                      key={o.value}
                      className={`settings-toggle-btn${refreshMs === o.value ? ' settings-toggle-btn--active' : ''}`}
                      onClick={() => setRefreshMs(o.value)}
                    >{o.label}</button>
                  ))}
                </div>
              </div>
              <HelpButton id="refresh" text={t.settings.helpRefresh} {...hp} />
            </div>
          </>
        )}

        {/* ── Uživatelé ── */}
        {activeTab === 'users' && isAdmin && (
          <UsersTab token={token} />
        )}

        {/* ── Připojení ── */}
        {activeTab === 'connection' && (
          <>
            {/* Podsekce: PLC / ADS */}
            <div className="settings-section-header settings-section-header--first">
              <Cpu size={13} />
              {t.settings.connPlcSection}
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.connAds}</span>
              <div className="settings-row__control settings-status">
                {health && <StatusDot ok={health.checks.ads} />}
                <span>
                  {health
                    ? (health.checks.ads ? t.settings.connAdsConnected : t.settings.connAdsDisconnected)
                    : '—'}
                </span>
              </div>
              <HelpButton id="ads" text={t.settings.helpAds} {...hp} />
            </div>

            {config && (
              <div className="settings-row">
                <span className="settings-row__label">{t.settings.connNetId}</span>
                <span className="settings-meta">{config.ads.net_id}</span>
                <HelpButton id="netId" text={t.settings.helpNetId} {...hp} />
              </div>
            )}

            {config && (
              <div className="settings-row">
                <span className="settings-row__label">{t.settings.connPort}</span>
                <span className="settings-meta">{config.ads.port}</span>
                <HelpButton id="port" text={t.settings.helpPort} {...hp} />
              </div>
            )}

            {/* Podsekce: Úložiště */}
            <div className="settings-section-header">
              <HardDrive size={13} />
              {t.settings.connStorageSection}
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.connLocal}</span>
              <div className="settings-row__control settings-status">
                {health && <StatusDot ok={health.checks.local_storage} />}
                <span>
                  {health
                    ? (health.checks.local_storage ? t.settings.connLocalOk : t.settings.connLocalMissing)
                    : '—'}
                </span>
              </div>
              <HelpButton id="local" text={t.settings.helpLocal} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.connLocalPath}</span>
              <div className="settings-path-control">
                <input
                  className="settings-path-input"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  disabled={pathBusy}
                  spellCheck={false}
                />
                <button
                  className="btn btn--secondary btn--sm settings-browse-btn"
                  onClick={() => setPickerOpen(true)}
                  disabled={pathBusy}
                  title={t.settings.connBrowse}
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleSavePath}
                  disabled={pathBusy}
                >
                  {lang === 'cs' ? 'Uložit' : 'Save'}
                </button>
              </div>
              <HelpButton id="localPath" text={t.settings.helpLocalPath} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.connNas}</span>
              <div className="settings-row__control settings-status">
                {!statusChecking && status !== null && <StatusDot ok={status.remote_available} />}
                <span>
                  {statusChecking
                    ? t.db.dotChecking
                    : status !== null
                      ? (status.remote_available ? t.settings.connNasAvail : t.settings.connNasUnavail)
                      : '—'}
                </span>
              </div>
              <HelpButton id="nas" text={t.settings.helpNas} {...hp} />
            </div>

            <div className="settings-row">
              <span className="settings-row__label">{t.settings.connRemotePath}</span>
              <div className="settings-path-control">
                <input
                  className="settings-path-input"
                  value={remotePath}
                  onChange={e => setRemotePath(e.target.value)}
                  disabled={pathBusy}
                  spellCheck={false}
                />
                <button
                  className="btn btn--primary btn--sm"
                  onClick={handleSavePath}
                  disabled={pathBusy}
                >
                  {lang === 'cs' ? 'Uložit' : 'Save'}
                </button>
              </div>
              <HelpButton id="remotePath" text={t.settings.helpRemotePath} {...hp} />
            </div>
          </>
        )}

      </div>

      {pickerOpen && (
        <FolderPickerModal
          initialPath={localPath}
          onSelect={path => setLocalPath(path.replace(/\//g, '\\'))}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
