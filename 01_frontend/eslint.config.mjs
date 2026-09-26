/**
 * ESLint — automatická kontrola pravidel projektu (npm run lint).
 *
 * Hlídá to, co TypeScript nepozná:
 *   - react-hooks/rules-of-hooks  — hooky nesmí být podmíněné / za předčasným return (chyba)
 *   - react-hooks/exhaustive-deps — úplné závislosti useEffect / useCallback / useMemo
 *   - no-explicit-any             — bez `any` (pravidlo projektu: unknown + narrowing)
 *   - no-console                  — console.log / debug nepatří do produkčního kódu
 *
 * Není součástí `npm run build` (build se lintem nezastaví) — spouštět ručně / v CI.
 */
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  // Odpojený Overview / WIP (kód zachován záměrně, nezobrazuje se) — mimo kontrolu
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/pages/Overview.tsx', 'src/pages/Wip.tsx'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Testy: mocky a pomocné výpisy jsou v pořádku
    files: ['src/test/**/*.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
]
