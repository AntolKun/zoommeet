const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

const TOKEN_KEY = 'videoconf.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/**
 * Decodes the current app JWT payload and returns the user id (`uid` claim).
 * Returns null if no token, malformed token, or no uid in payload.
 */
export function getCurrentUserId(): number | null {
  const token = getToken()
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(padded)) as { uid?: unknown }
    return typeof payload.uid === 'number' ? payload.uid : null
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  body: unknown
  /** Machine-readable error code, e.g. "password_required". */
  code?: string

  constructor(status: number, body: unknown, message: string, code?: string) {
    super(message)
    this.status = status
    this.body = body
    this.code = code
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  /** Skip Authorization header even if a token is stored. */
  noAuth?: boolean
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (!opts.noAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (res.status === 204) {
    return undefined as T
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

  if (!res.ok) {
    const obj = (typeof data === 'object' && data !== null ? data : {}) as {
      error?: unknown
      code?: unknown
    }
    const message = 'error' in obj ? String(obj.error) : `HTTP ${res.status}`
    const code = typeof obj.code === 'string' ? obj.code : undefined
    throw new ApiError(res.status, data, message, code)
  }

  return data as T
}
