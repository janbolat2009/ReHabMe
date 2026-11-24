// Field-level encryption for sensitive free text (AES-256-GCM), plus hashing helpers.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(_scrypt)
const PREFIX = 'enc:v1:'

export function createFieldCipher(base64Key) {
  const key = Buffer.from(base64Key, 'base64')
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return {
    encrypt(plain) {
      if (plain == null) return plain
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
      return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
    },
    decrypt(stored) {
      if (stored == null || !String(stored).startsWith(PREFIX)) return stored
      const buf = Buffer.from(String(stored).slice(PREFIX.length), 'base64')
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
      d.setAuthTag(buf.subarray(12, 28))
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')
    },
  }
}

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(expected, actual)
}

// Human-friendly one-time share code (no ambiguous characters).
export function generateShareCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let out = ''
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length]
  return `${out.slice(0, 4)}-${out.slice(4)}`
}
