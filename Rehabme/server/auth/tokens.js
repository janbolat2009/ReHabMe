// Token verification. Two providers:
//  - firebase: verifies Firebase Auth ID tokens (RS256) against Google's public JWKS. No service account needed.
//  - local: HS256 tokens issued by this API. Dev/test/staging/demo only (config refuses it in production).
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'
import { unauthorized } from '../lib/errors.js'

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

export function createTokenService(config) {
  if (config.AUTH_PROVIDER === 'firebase') {
    const jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL))
    return {
      provider: 'firebase',
      async verify(token) {
        try {
          const { payload } = await jwtVerify(token, jwks, {
            issuer: `https://securetoken.google.com/${config.FIREBASE_PROJECT_ID}`,
            audience: config.FIREBASE_PROJECT_ID,
            algorithms: ['RS256'],
          })
          if (!payload.sub) throw new Error('missing sub')
          return { provider: 'firebase', uid: payload.sub, email: payload.email ?? null, name: payload.name ?? null }
        } catch {
          throw unauthorized('Сессия недействительна или истекла. Войдите снова.')
        }
      },
    }
  }

  const secret = new TextEncoder().encode(config.LOCAL_AUTH_SECRET)
  return {
    provider: 'local',
    async issue(user) {
      return new SignJWT({ email: user.email, name: user.display_name })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(user.auth_uid)
        .setIssuer('rehabme-local')
        .setAudience('rehabme-api')
        .setIssuedAt()
        .setExpirationTime('8h')
        .sign(secret)
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, secret, { issuer: 'rehabme-local', audience: 'rehabme-api', algorithms: ['HS256'] })
        return { provider: 'local', uid: payload.sub, email: payload.email ?? null, name: payload.name ?? null }
      } catch {
        throw unauthorized('Сессия недействительна или истекла. Войдите снова.')
      }
    },
  }
}
