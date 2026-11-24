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
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildConnector, integrityOf } from '../src/build/index.js';

const BIN = fileURLToPath(new URL('../bin/build-connector.js', import.meta.url));

const SOURCE = `const API = 'https://api.example.com';
export default {
  async languages() { return { pairs: 'any' }; },
  async submit({ targets }) { return { state: {}, jobs: [{ id: 'j', targets }] }; },
  async status({ state }) { return { state, items: [] }; },
  async fetch({ state }) { return { state, items: [], api: API }; },
};
`;

const MANIFEST = {
  id: 'tmp',
  name: 'Tmp',
  contract: 1,
  entry: 'connector.js',
  egressHosts: ['api.example.com'],
  credentials: [],
  auth: { profile: 'bearer-static', credential: 'token' },
  options: { type: 'object' },
  capabilities: {
    cancel: false, maxBatchItems: 1, maxBatchBytes: 1000, formats: ['html'],
  },
};

async function makeConnector(dir, { manifest = MANIFEST, source = SOURCE } = {}) {
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'connector.json'), JSON.stringify(manifest));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'tmp', version: '2.3.4' }));
  if (source !== null) {
    await writeFile(join(dir, 'src', 'connector.js'), source);
  }
}

describe('integrityOf', () => {
  it('returns a sha384 SRI value', () => {
    const expected = `sha384-${createHash('sha384').update('abc').digest('base64')}`;
    assert.strictEqual(integrityOf('abc'), expected);
  });
});

describe('buildConnector', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'connector-build-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('writes the bundle and a built manifest with version and integrity', async () => {
    await makeConnector(dir);
    const { manifest, bundle } = await buildConnector({ dir });
    const code = await readFile(bundle);
    assert.strictEqual(manifest.version, '2.3.4');
    assert.strictEqual(manifest.integrity, integrityOf(code));
    assert.deepStrictEqual(Object.keys(manifest).slice(0, 6), ['id', 'version', 'name', 'contract', 'entry', 'integrity']);
    const written = JSON.parse(await readFile(join(dir, 'dist', 'connector.json'), 'utf-8'));
    assert.deepStrictEqual(written, manifest);
    assert.strictEqual(manifest.capabilities.kinds, undefined);
  });

  it('inlines imports into one module', async () => {
    await makeConnector(dir, { source: "import { API } from './api.js';\nexport default { API };\n" });
    await writeFile(join(dir, 'src', 'api.js'), "export const API = 'x';\n");
    const { bundle } = await buildConnector({ dir });
    assert.doesNotMatch(await readFile(bundle, 'utf-8'), /\bimport\b/);
  });

  it('refuses version or integrity in the source manifest', async () => {
    await makeConnector(dir, { manifest: { ...MANIFEST, version: '1.0.0', integrity: 'x' } });
    await assert.rejects(buildConnector({ dir }), (e) => {
      assert.match(e.message, /remove version; the build sets it/);
      assert.match(e.message, /remove integrity; the build sets it/);
      return true;
    });
  });

  it('refuses an invalid manifest', async () => {
    await makeConnector(dir, { manifest: { ...MANIFEST, contract: 2 } });
    await assert.rejects(buildConnector({ dir }), /connector.json: \/contract must be equal to constant/);
  });

  it('refuses a bundle that uses banned globals', async () => {
    await makeConnector(dir, { source: 'export default { go: () => setTimeout(() => {}, 1) };\n' });
    await assert.rejects(buildConnector({ dir }), /bundle uses banned features:\nline \d+: use of setTimeout/);
  });

  it('refuses a version that is not semver', async () => {
    await makeConnector(dir);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: 'next' }));
    await assert.rejects(buildConnector({ dir }), /built manifest: \/version must match pattern/);
  });

  it('fails when the source entry is missing', async () => {
    await makeConnector(dir, { source: null });
    await assert.rejects(buildConnector({ dir }), /Could not resolve/);
  });
});

describe('aem-connector-build', () => {
  const run = promisify(execFile);
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'connector-cli-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('builds the connector in the given folder', async () => {
    await makeConnector(dir);
    const { stdout } = await run(process.execPath, [BIN, dir]);
    assert.match(stdout, /^built tmp@2\.3\.4 → .*connector\.js \(sha384-/);
  });

  it('exits with 1 and the reason on failure', async () => {
    await makeConnector(dir, { manifest: { ...MANIFEST, contract: 2 } });
    await assert.rejects(run(process.execPath, [BIN], { cwd: dir }), (e) => {
      assert.strictEqual(e.code, 1);
      assert.match(e.stderr, /contract must be equal to constant/);
      return true;
    });
  });
});
