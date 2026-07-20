/**
 * @file ErrorBoundary.tsx
 * @description React Error Boundary — zachycuje runtime chyby v potomcích a zobrazuje
 *   záložní UI místo pádu celé aplikace. Musí být class component (hooks nefungují
 *   v error boundaries). Překlady čteny přes LangContext.Consumer.
 *   Tlačítko "Zkusit znovu" / "Try again" resetuje stav.
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { LangContext } from '../context/LangContext'

interface Props {
  children: ReactNode
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
                onClick={() => this.setState({ hasError: false, error: null })}
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
