// Authentication facade. Production: Firebase Auth (lazy-loaded, only the auth module).
// Development / tests / staging demo: the API's local provider. Chosen via VITE_AUTH_PROVIDER.
const PROVIDER = import.meta.env.VITE_AUTH_PROVIDER || 'local'
const TOKEN_KEY = 'rehabme.token'
const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

const listeners = new Set()
let fb = null // { auth, mod }
let current = null // { uid, email } | null

const emit = () => listeners.forEach((fn) => fn(current))
const safeStorage = {
  get: (k) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k) => { try { sessionStorage.removeItem(k) } catch { /* private mode */ } },
}

async function firebase() {
  if (fb) return fb
  const [{ initializeApp }, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  const a = mod.getAuth(app)
  fb = { auth: a, mod }
  return fb
}

async function localCall(path, body) {
  const res = await fetch(`${BASE}/auth/local${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'Ошибка входа'), { code: data?.error?.code, details: data?.error?.details })
  return data.token
}

const decode = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) } catch { return null } }

const FIREBASE_ERRORS = {
  'auth/invalid-credential': 'Неверный email или пароль',
  'auth/wrong-password': 'Неверный email или пароль',
  'auth/user-not-found': 'Неверный email или пароль',
  'auth/email-already-in-use': 'Этот email уже зарегистрирован',
  'auth/weak-password': 'Пароль слишком простой',
  'auth/invalid-email': 'Проверьте адрес электронной почты',
  'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже',
  'auth/network-request-failed': 'Нет соединения с интернетом',
}
const fbError = (e) => new Error(FIREBASE_ERRORS[e.code] || 'Не удалось выполнить вход. Попробуйте ещё раз.')

export const auth = {
  provider: PROVIDER,
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  get user() { return current },

  async init() {
    if (PROVIDER === 'firebase') {
      const { auth: a, mod } = await firebase()
      await new Promise((resolve) => {
        mod.onAuthStateChanged(a, (u) => { current = u ? { uid: u.uid, email: u.email } : null; emit(); resolve() })
      })
      return current
    }
    const t = safeStorage.get(TOKEN_KEY)
    const claims = t && decode(t)
    current = claims && claims.exp * 1000 > Date.now() ? { uid: claims.sub, email: claims.email } : null
    if (!current) safeStorage.del(TOKEN_KEY)
    return current
  },

  async getToken() {
    if (PROVIDER === 'firebase') {
      const { auth: a } = await firebase()
      return a.currentUser ? a.currentUser.getIdToken() : null
    }
    return current ? safeStorage.get(TOKEN_KEY) : null
  },

  async login(email, password) {
    if (PROVIDER === 'firebase') {
      const { auth: a, mod } = await firebase()
      try { await mod.signInWithEmailAndPassword(a, email.trim(), password) } catch (e) { throw fbError(e) }
      return
    }
    const token = await localCall('/login', { email, password })
    safeStorage.set(TOKEN_KEY, token)
    const c = decode(token)
    current = { uid: c.sub, email: c.email }
    emit()
  },

  async register(email, password, displayName) {
    if (PROVIDER === 'firebase') {
      const { auth: a, mod } = await firebase()
      try {
        const cred = await mod.createUserWithEmailAndPassword(a, email.trim(), password)
        await mod.updateProfile(cred.user, { displayName })
        await cred.user.getIdToken(true)
      } catch (e) { throw fbError(e) }
      return
    }
    const token = await localCall('/register', { email, password, displayName })
    safeStorage.set(TOKEN_KEY, token)
    const c = decode(token)
    current = { uid: c.sub, email: c.email }
    emit()
  },

  async resetPassword(email) {
    if (PROVIDER !== 'firebase') throw new Error('В демонстрационной среде восстановление пароля недоступно. Обратитесь к администратору.')
    const { auth: a, mod } = await firebase()
    try { await mod.sendPasswordResetEmail(a, email.trim()) } catch (e) { throw fbError(e) }
  },

  async logout() {
    if (PROVIDER === 'firebase') {
      const { auth: a, mod } = await firebase()
      await mod.signOut(a)
    } else {
      safeStorage.del(TOKEN_KEY)
      current = null
      emit()
    }
  },

  // Called by the API client on 401: drop the session so the router sends the user to sign-in.
  handleUnauthorized() {
    if (PROVIDER !== 'firebase' && current) { safeStorage.del(TOKEN_KEY); current = null; emit() }
  },
}
