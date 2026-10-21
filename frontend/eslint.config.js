import js from '@eslint/js';
import globals from 'globals';
import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.eslintrc.cjs'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    plugins: { '@typescript-eslint': ts, 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...js.configs.recommended.rules, ...ts.configs['eslint-recommended'].overrides[0].rules, ...ts.configs.recommended.rules, 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn', 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }], '@typescript-eslint/no-explicit-any': 'warn' },
  },
];
