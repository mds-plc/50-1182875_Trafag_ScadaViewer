/**
 * @file apiFetch.test.ts
 * @description Testy utils/apiFetch — UNAUTHORIZED_EVENT se vyšle jen při 401
 *   s hlavičkou WWW-Authenticate: Bearer a jen pro požadavek s Bearer tokenem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch, UNAUTHORIZED_EVENT } from '../utils/apiFetch'

function mockResponse(status: number, wwwAuth?: string) {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(null, { status, headers: wwwAuth ? { 'WWW-Authenticate': wwwAuth } : {} }),
  )
}

let events: string[] = []
const listener = (e: Event) => { events.push((e as CustomEvent<{ token: string }>).detail.token) }

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  events = []
  window.addEventListener(UNAUTHORIZED_EVENT, listener)
})

afterEach(() => {
  window.removeEventListener(UNAUTHORIZED_EVENT, listener)
  vi.unstubAllGlobals()
})

const AUTH = { headers: { Authorization: 'Bearer tok-1' } }

describe('apiFetch', () => {
  it('401 + WWW-Authenticate: Bearer → event with request token', async () => {
    mockResponse(401, 'Bearer')
    const res = await apiFetch('/api/files', AUTH)
    expect(res.status).toBe(401)
    expect(events).toEqual(['tok-1'])
  })

  it('401 without WWW-Authenticate (e.g. wrong current password) → no event', async () => {
    mockResponse(401)
    await apiFetch('/api/users/x/password', AUTH)
    expect(events).toEqual([])
  })

  it('401 for request without Bearer token → no event', async () => {
    mockResponse(401, 'Bearer')
    await apiFetch('/api/files')
    expect(events).toEqual([])
  })

  it('non-401 responses → no event, response passed through', async () => {
    mockResponse(403, 'Bearer')
    const res = await apiFetch('/api/users', AUTH)
    expect(res.status).toBe(403)
    expect(events).toEqual([])
  })
})
