/**
 * @file apiFetch.ts
 * @description Tenký wrapper nad `fetch` pro autentizovaná volání API.
 *
 * Účel: Detekuje neplatnou / vypršelou session (restart backendu, TTL 8 h) a oznámí ji
 *   AuthContextu, který uživatele odhlásí a zobrazí přihlašovací obrazovku.
 *   Bez toho by UI zůstalo „přihlášené" a všechny požadavky by padaly na HTTP 401.
 *
 * Mechanismus:
 *   Backend (api/dependencies.py require_auth) vrací při neplatném tokenu 401 s hlavičkou
 *   `WWW-Authenticate: Bearer` (RFC 6750). Jiné 401 — např. špatné aktuální heslo při změně
 *   hesla — tuto hlavičku nemají a odhlášení nespustí.
 *   Událost nese token, se kterým byl požadavek odeslán → AuthContext odhlásí jen pokud
 *   jde o aktuální token (pozdní odpověď na starý token nesmí shodit novou session).
 *
 * Rozhraní:
 *   apiFetch(input, init)          — stejné API jako fetch()
 *   UNAUTHORIZED_EVENT             — název window události
 *   UnauthorizedDetail             — { token } v event.detail
 */

export const UNAUTHORIZED_EVENT = 'scada:unauthorized'

export interface UnauthorizedDetail {
  /** Bearer token, se kterým server požadavek odmítl. */
  token: string
}

/** Vytáhne Bearer token z hlaviček požadavku (null pokud chybí). */
function bearerToken(headers: HeadersInit | undefined): string | null {
  if (!headers) return null
  const value = new Headers(headers).get('Authorization')
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null
}

/**
 * `fetch` s detekcí neplatné session. Odpověď vrací beze změny — volající ji
 * zpracuje jako dosud (chybová hláška, loading stav).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res   = await fetch(input, init)
  const token = bearerToken(init?.headers)
  if (
    res.status === 401 &&
    token !== null &&
    res.headers?.get('WWW-Authenticate')?.startsWith('Bearer')
  ) {
    window.dispatchEvent(new CustomEvent<UnauthorizedDetail>(UNAUTHORIZED_EVENT, { detail: { token } }))
  }
  return res
}
