import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**', 'node_modules/**', 'ml/**', 'test-results/**', 'playwright-report/**', 'public/**',
      // Legacy v1 files kept on disk pending removal (not imported anywhere; see CHANGELOG.md):
      'server.js', 'env.d.ts', 'src/firebase.js', 'src/composables/**', 'src/layouts/**', 'src/components/TheBottomNav.vue',
      'src/stores/settings.js', 'src/stores/subscription.js', 'src/pages/programs/**', 'src/pages/*.vue', 'src/pages/auth/Poll.vue', 'src/pages/auth/VerifyCodePage.vue',
    ],
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-indent': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/no-v-html': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
]
