/**
 * @file ErrorBoundary.tsx
 * @description React Error Boundary — zachycuje runtime chyby v potomcích a zobrazuje
 *   záložní UI místo pádu celé aplikace. Musí být class component (hooks nefungují
 *   v error boundaries). Překlady čteny přes LangContext.Consumer.
 *   Tlačítko "Zkusit znovu" / "Try again" resetuje stav; u chyby načtení části aplikace
 *   (nový build bez obnovení kiosku) stránku znovu načte. Změna `resetKey` (cesta) chybu
 *   zruší — přechod na jinou stránku v menu funguje i po chybě.
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { LangContext } from '../context/LangContext'

interface Props {
  children: ReactNode
  /** Změna klíče (např. cesta stránky) zruší zobrazenou chybu. */
  resetKey?: string
}

/** Chyba načtení lazy chunku — React.lazy si zamítnutí pamatuje, pomůže jen reload stránky. */
export function isChunkLoadError(error: Error | null): boolean {
  return !!error && /dynamically imported module|Importing a module script failed|Loading chunk|preload/i.test(error.message)
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Zachytí runtime chyby v potomcích — zabrání pádu celé aplikace.
 * Musí být class component (React hooks nefungují v error boundaries).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  private retry = (): void => {
    if (isChunkLoadError(this.state.error)) window.location.reload()
    else this.setState({ hasError: false, error: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logovat chybu do konzole — v produkci lze napojit na error tracking (Sentry apod.)
    console.error('[ErrorBoundary] Zachycena chyba v komponentě:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <LangContext.Consumer>
        {({ t }) => (
          <div className="error-boundary">
            <div className="error-boundary__card">
              <div className="error-boundary__title">{t.error.title}</div>
              <p className="error-boundary__message">
                {this.state.error?.message ?? t.error.message}
              </p>
              <button
                className="btn btn--secondary"
                onClick={this.retry}
              >
                {t.error.retry}
              </button>
            </div>
          </div>
        )}
      </LangContext.Consumer>
    )
  }
}
