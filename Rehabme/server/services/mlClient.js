// Client for the Python ML inference service. Designed to fail closed and honestly:
// if the service is down, slow, or only has a non-validated model, the API says so instead of guessing.

export function createMlClient(config, log) {
  const base = config.ML_SERVICE_URL.replace(/\/$/, '')

  async function call(path, { method = 'GET', body } = {}) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), config.ML_TIMEOUT_MS)
    try {
      const res = await fetch(base + path, {
        method, signal: ctrl.signal,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) throw new Error(`ml service ${res.status}`)
      return await res.json()
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async status() {
      try {
        const info = await call('/model')
        return { available: true, ...info }
      } catch (e) {
        log.warn({ err: e.message }, 'ml service unavailable')
        return { available: false, reason: 'service_unreachable' }
      }
    },
    async predict(features) {
      return call('/predict', { method: 'POST', body: { features } })
    },
  }
}

// Decide which model modes may be shown to a patient in this environment.
export function allowedMode(config, model) {
  if (!model) return null
  if (model.status === 'validated') return 'validated'
  if (model.data_source === 'synthetic_test_fixture') return config.ML_ALLOW_DEMO_MODELS ? 'demo' : null
  if (model.status === 'research') return config.APP_ENV === 'production' ? null : 'research'
  return null
}
