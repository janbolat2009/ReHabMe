import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['server/tests/**/*.test.js', 'src/**/*.test.js'],
    environmentMatchGlobs: [['src/**', 'jsdom']],
    env: { APP_ENV: 'test', NODE_ENV: 'test', LOG_LEVEL: 'silent', AUTH_PROVIDER: 'local', DATABASE_PATH: ':memory:' },
    pool: 'forks',
  },
})
