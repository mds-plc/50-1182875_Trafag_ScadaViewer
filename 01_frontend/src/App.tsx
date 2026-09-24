/**
 * @file App.tsx
 * @description Kořenová komponenta aplikace — BrowserRouter, provider nesting
 *   (ToastProvider > PlcProvider > PlcAuth > AppShell) a definice 5 cest + fallback.
 *   PlcAuth přemosťuje PLC přihlášení z PlcContext do AuthContext.
 *   Neznámé cesty jsou přesměrovány na /.
 */
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LangProvider } from './context/LangContext'
import { PlcProvider, usePlc } from './context/PlcContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { usePlcWatcher } from './hooks/usePlcWatcher'
import Sidebar      from './components/Sidebar'
import Topbar       from './components/Topbar'
import LoginOverlay from './components/LoginOverlay'
import LoadingSpinner from './components/LoadingSpinner'
import Database  from './pages/Database'

// Code-splitting — hlavní stránka (Database) je v úvodním bundlu, ostatní se načítají
// zvlášť. Po startu se na pozadí přednačtou (preloadPages), takže přechod je okamžitý.
const loadChartView = () => import('./pages/ChartView')
const loadSettings  = () => import('./pages/Settings')
const loadInfo      = () => import('./pages/Info')
const ChartView = lazy(loadChartView)
const Settings  = lazy(loadSettings)
const Info      = lazy(loadInfo)

function preloadPages(): void {
  void loadChartView(); void loadSettings(); void loadInfo()
}
import { useBackendOnline } from './hooks/useBackendOnline'
import { useLang } from './context/LangContext'
import { WifiOff } from 'lucide-react'

/** Symbol PLC přihlášení uživatele (Out.Status.UserLoggedIn BOOL). */
const PLC_LOGIN_SYMBOL = 'plc_operator_login'

/** Čte PLC přihlášení z kontextu — musí být uvnitř PlcProvider. */
function PlcAuth({ children }: { children: React.ReactNode }) {
  const { status } = usePlc()
  const plcLoggedIn = status[PLC_LOGIN_SYMBOL]?.value === true
  return <AuthProvider plcLoggedIn={plcLoggedIn}>{children}</AuthProvider>
}

function AppShell() {
  const { isLoggedIn } = useAuth()
  const { t } = useLang()
  const online = useBackendOnline()
  usePlcWatcher()

  // Přednačíst ostatní stránky, až prohlížeč nemá co dělat (neblokuje první vykreslení)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(preloadPages)
    else setTimeout(preloadPages, 1000)
  }, [])

  return (
    <>
      {!online && (
        <div className="offline-banner" role="alert">
          <WifiOff size={15} />
          {t.common.backendOffline}
        </div>
      )}
      {!isLoggedIn && <LoginOverlay />}
      <div className="app">
        <Sidebar />
        <Topbar />
        <main className="content">
          <ErrorBoundary>
            <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/"         element={<Navigate to="/database" replace />} />
              <Route path="/database" element={<Database />} />
              <Route path="/chart"    element={<ChartView />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/info"     element={<Info />} />
              <Route path="*"         element={<Navigate to="/database" replace />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </>
  )
}

export default function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <ToastProvider>
          <PlcProvider>
            <PlcAuth>
              <AppShell />
            </PlcAuth>
          </PlcProvider>
        </ToastProvider>
      </BrowserRouter>
    </LangProvider>
  )
}
