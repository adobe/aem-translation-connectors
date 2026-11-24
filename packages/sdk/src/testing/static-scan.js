/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';

export const BANNED_GLOBALS = Object.freeze([
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator', 'importScripts', 'Worker',
  'window', 'self', 'global', 'globalThis', 'document', 'XMLSerializer', 'DOMParser',
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
  'clearImmediate', 'requestAnimationFrame', 'requestIdleCallback',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'eval', 'Function', 'process', 'require', 'Buffer',
]);

/**
 * Finds uses of globals and features a connector must not use. A name the module declares
 * itself, such as its own `fetch` method, is not a use of the global.
 * @param {string} source ES module source.
 * @param {{ allowImports?: boolean }} [opts] A bundle must not import anything. Set
 *   `allowImports` to scan unbundled source.
 * @returns {string[]} One message per use, with line numbers.
 */
export function scanSource(source, { allowImports = false } = {}) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const declared = new Set();
  const references = [];
  const problems = [];
  ancestor(ast, {
    VariablePattern(node) {
      declared.add(node.name);
    },
    ImportSpecifier(node) {
      declared.add(node.local.name);
    },
    ImportDefaultSpecifier(node) {
      declared.add(node.local.name);
    },
    ImportNamespaceSpecifier(node) {
      declared.add(node.local.name);
    },
    Identifier(node) {
      references.push(node);
    },
    ImportExpression(node) {
      problems.push({ line: node.loc.start.line, message: 'dynamic import()' });
    },
    ImportDeclaration(node) {
      if (!allowImports) {
        problems.push({ line: node.loc.start.line, message: `import of "${node.source.value}"` });
      }
    },
  });
  references
    .filter(({ name }) => BANNED_GLOBALS.includes(name) && !declared.has(name))
    .forEach(({ name, loc }) => problems.push({ line: loc.start.line, message: `use of ${name}` }));
  return problems
    .sort((a, b) => a.line - b.line)
    .map(({ line, message }) => `line ${line}: ${message}`);
}

/**
 * @param {string|URL} file
 * @param {{ allowImports?: boolean }} [opts]
 * @returns {Promise<string[]>}
 */
export async function scanFile(file, opts) {
  return scanSource(await readFile(file, 'utf-8'), opts);
}
