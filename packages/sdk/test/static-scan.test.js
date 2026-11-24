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

import assert from 'node:assert';
import { scanFile, scanSource } from '../src/testing/static-scan.js';

describe('scanSource', () => {
  it('allows a connector that only uses its own names', () => {
    const source = `async function fetch() { return { items: [] }; }
      export default { fetch, async status(input, host) { return host.message({ type: 'log' }); } };`;
    assert.deepStrictEqual(scanSource(source), []);
  });

  it('flags banned globals with line numbers', () => {
    const source = 'const a = 1;\nsetTimeout(() => {}, a);\nexport default { x: window.y, z: globalThis.fetch };';
    assert.deepStrictEqual(scanSource(source), [
      'line 2: use of setTimeout',
      'line 3: use of window',
      'line 3: use of globalThis',
    ]);
  });

  it('ignores property names that match banned globals', () => {
    assert.deepStrictEqual(scanSource('export const o = { fetch: 1, document: 2 }; o.localStorage = 3;'), []);
  });

  it('flags shorthand uses of a global', () => {
    assert.deepStrictEqual(scanSource('export default { fetch };'), ['line 1: use of fetch']);
  });

  it('flags imports in a bundle unless allowed', () => {
    const source = "import { a } from './a.js';\nimport b from 'b';\nimport * as c from 'c';\nexport default { a, b, c };";
    assert.deepStrictEqual(scanSource(source), [
      'line 1: import of "./a.js"',
      'line 2: import of "b"',
      'line 3: import of "c"',
    ]);
    assert.deepStrictEqual(scanSource(source, { allowImports: true }), []);
  });

  it('treats imported names as declared', () => {
    assert.deepStrictEqual(scanSource("import { fetch } from './x.js';\nfetch();", { allowImports: true }), []);
  });

  it('flags dynamic import', () => {
    assert.deepStrictEqual(scanSource("export default import('x');"), ['line 1: dynamic import()']);
  });

  it('scans a file', async () => {
    assert.deepStrictEqual(await scanFile(new URL('../src/contract.js', import.meta.url)), []);
  });
});
