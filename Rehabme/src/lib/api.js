// Fetch wrapper: auth header, JSON, timeouts, typed errors, idempotent-GET retry.
import { auth } from './auth.js'

const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(method, path, body, { timeout = 15000, retries = method === 'GET' ? 1 : 0, raw = false } = {}) {
  const token = await auth.getToken()
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    try {
      const res = await fetch(BASE + path, {
        method,
        signal: ctrl.signal,
        headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      if (raw && res.ok) return res
      const data = res.status === 204 ? null : await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 401) auth.handleUnauthorized()
        throw new ApiError(res.status, data?.error?.code ?? 'http_error', data?.error?.message ?? 'Не удалось выполнить запрос', data?.error?.details)
      }
      return data
    } catch (e) {
      if (e instanceof ApiError) throw e
      if (attempt < retries) { await new Promise((r) => setTimeout(r, 600 * (attempt + 1))); continue }
      throw new ApiError(0, e.name === 'AbortError' ? 'timeout' : 'network', e.name === 'AbortError' ? 'Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз.' : 'Нет соединения с сервером. Проверьте интернет.')
    } finally {
      clearTimeout(timer)
    }
  }
}

export const api = {
  get: (p, o) => request('GET', p, null, o),
  post: (p, b, o) => request('POST', p, b ?? {}, o),
  put: (p, b, o) => request('PUT', p, b, o),
  del: (p, b, o) => request('DELETE', p, b, o),
  raw: (p) => request('GET', p, null, { raw: true }),
}
