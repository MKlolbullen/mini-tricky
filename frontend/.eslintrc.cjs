/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs', '.eslintrc.cjs', 'vite.config.ts'],
  rules: {
    // The existing codebase uses `any` in places for React Flow callback
    // types — keep as a warning rather than an error so CI passes green.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // React Flow + Monaco imports sometimes need a type-only path
    '@typescript-eslint/consistent-type-imports': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
  },
};
