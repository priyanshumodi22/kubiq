const js = require('@eslint/js');
const globals = require('globals');
const ts = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');

module.exports = [
  { ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', '.eslintrc.cjs'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.jest } },
    plugins: { '@typescript-eslint': ts },
    rules: { ...js.configs.recommended.rules, ...ts.configs['eslint-recommended'].overrides[0].rules, ...ts.configs.recommended.rules, '@typescript-eslint/no-explicit-any': 'warn' },
  },
];
