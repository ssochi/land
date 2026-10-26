import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'out/', 'node_modules/'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tools/**/*.mjs', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  // compare.mjs measures images inside the page (page.evaluate), so its callbacks see browser globals
  { files: ['tools/compare.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // scene scripts are classic browser scripts that call the page-provided defineScene()
  { files: ['scene.js', 'scenes/**/*.js'], languageOptions: { sourceType: 'script', globals: { defineScene: 'readonly' } } },
  { rules: { 'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }] } }
];
