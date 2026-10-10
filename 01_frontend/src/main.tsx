import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'

// Nový build na serveru, kiosk má otevřenou starou verzi → odkazované chunky už neexistují.
// Vite hlásí vite:preloadError — stránku jednou znovu načíst (pojistka proti smyčce: 30 s).
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('scada_chunk_reload') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('scada_chunk_reload', String(Date.now()))
  } catch { /* storage nedostupný — přesto reload */ }
  e.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
