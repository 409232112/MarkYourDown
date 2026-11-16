/**
 * CSS Bundle Loader for HTML Export
 * Supports both Vite bundler (?raw) and Node/Vitest test runner environments.
 */

import rawTokens from './tokens.css?raw';
import rawContent from './content.css?raw';
import rawKatex from 'katex/dist/katex.min.css?raw';

let cachedTokens = typeof rawTokens === 'string' && rawTokens.length > 0 ? rawTokens : '';
let cachedContent = typeof rawContent === 'string' && rawContent.length > 0 ? rawContent : '';
let cachedKatex = typeof rawKatex === 'string' && rawKatex.length > 0 ? rawKatex : '';

export function getTokensCss(): string {
  if (cachedTokens) return cachedTokens;
  try {
    // Dynamic import/read for Node/Vitest
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = require('node:fs');
      const path = require('node:path');
      const p = path.resolve(__dirname, 'tokens.css');
      if (fs.existsSync(p)) {
        cachedTokens = fs.readFileSync(p, 'utf-8');
        return cachedTokens;
      }
    }
  } catch {}
  return '';
}

export function getContentCss(): string {
  if (cachedContent) return cachedContent;
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = require('node:fs');
      const path = require('node:path');
      const p = path.resolve(__dirname, 'content.css');
      if (fs.existsSync(p)) {
        cachedContent = fs.readFileSync(p, 'utf-8');
        return cachedContent;
      }
    }
  } catch {}
  return '';
}

export function getKatexCss(): string {
  if (cachedKatex) return cachedKatex;
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = require('node:fs');
      const path = require('node:path');
      const p = path.resolve(__dirname, '../../../node_modules/katex/dist/katex.min.css');
      if (fs.existsSync(p)) {
        cachedKatex = fs.readFileSync(p, 'utf-8');
        return cachedKatex;
      }
      const p2 = path.resolve(__dirname, '../../node_modules/katex/dist/katex.min.css');
      if (fs.existsSync(p2)) {
        cachedKatex = fs.readFileSync(p2, 'utf-8');
        return cachedKatex;
      }
    }
  } catch {}
  return '';
}
