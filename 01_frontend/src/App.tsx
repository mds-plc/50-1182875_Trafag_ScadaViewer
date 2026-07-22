/**
 * @file App.tsx
 * @description Kořenová komponenta aplikace — BrowserRouter, provider nesting
 *   (ToastProvider > PlcProvider > PlcAuth > AppShell) a definice 5 cest + fallback.
 *   PlcAuth přemosťuje PLC přihlášení z PlcContext do AuthContext.
 *   Neznámé cesty jsou přesměrovány na /.
 */
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
import Overview  from './pages/Overview'
import Database  from './pages/Database'
import ChartView from './pages/ChartView'
import Settings  from './pages/Settings'
import Info      from './pages/Info'
import Wip       from './pages/Wip'
import { useBackendOnline } from './hooks/useBackendOnline'
import { useLang } from './context/LangContext'
import { WifiOff } from 'lucide-react'

/** Symbol PLC přihlášení operátora. TODO: upřesnit po finalizaci GVL. */
const PLC_LOGIN_SYMBOL = 'in_ready'

/** Čte PLC přihlášení z kontextu — musí být uvnitř PlcProvider. */
function PlcAuth({ children }: { children: React.ReactNode }) {
  const { status } = usePlc()
  const plcLoggedIn = Boolean(status[PLC_LOGIN_SYMBOL]?.value)
  return <AuthProvider plcLoggedIn={plcLoggedIn}>{children}</AuthProvider>
}

function AppShell() {
  const { isLoggedIn } = useAuth()
  const { t } = useLang()
  const online = useBackendOnline()
  usePlcWatcher()

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
            <Routes>
              <Route path="/"         element={<Overview />} />
              <Route path="/database" element={<Database />} />
              <Route path="/chart"    element={<ChartView />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/info"     element={<Info />} />
              <Route path="/wip"      element={<Wip />} />
              <Route path="*"         element={<Navigate to="/" replace />} />
            </Routes>
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
