import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'out/', 'node_modules/'] },
  js.configs.recommended,
  { files: ['src/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['tools/**/*.mjs', 'test/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
  // compare.mjs, thumbs.mjs and lod-check.mjs work on images inside the page (page.evaluate): those callbacks see browser globals
  { files: ['tools/compare.mjs', 'tools/thumbs.mjs', 'tools/lod-check.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser, mapEditor: 'readonly' } } },
  // scene scripts are classic browser scripts that call the page-provided defineScene()
  { files: ['scene.js', 'scenes/**/*.js'], languageOptions: { sourceType: 'script', globals: { defineScene: 'readonly' } } },
  // maps.js is the start-screen list, a classic script calling the page-provided defineMaps()
  { files: ['maps.js'], languageOptions: { sourceType: 'script', globals: { defineMaps: 'readonly' } } },
  { rules: { 'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }] } }
];
