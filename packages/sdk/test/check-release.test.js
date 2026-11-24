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
import {
  mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkRelease, gitRunner } from '../src/release/index.js';

const BIN = fileURLToPath(new URL('../bin/check-release.js', import.meta.url));
const run = promisify(execFile);

const manifest = (hosts, id = 'demo') => ({ id, egressHosts: hosts, auth: { profile: 'basic' } });

describe('checkRelease', () => {
  let root;
  let git;

  async function write(id, value) {
    await mkdir(join(root, 'connectors', id), { recursive: true });
    await writeFile(join(root, 'connectors', id, 'connector.json'), typeof value === 'string' ? value : JSON.stringify(value));
  }

  async function commit(message) {
    await git(['add', '-A']);
    await git(['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false',
      'commit', '-q', '--allow-empty', '-m', message]);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'connector-release-'));
    git = gitRunner(root);
    await git(['init', '-q', '-b', 'main']);
    await write('demo', manifest(['api.example.com']));
    await write('same', manifest(['api.example.com'], 'same'));
    await commit('chore: base');
    await git(['branch', 'base']);
  });

  afterEach(async () => {
    await rm(root, { recursive: true });
  });

  it('passes when nothing breaking changed', async () => {
    await write('same', { ...manifest(['api.example.com'], 'same'), name: 'Same' });
    await commit('feat(same): rename');
    assert.deepStrictEqual(await checkRelease({ root, base: 'base' }), []);
  });

  it('fails a breaking change without a breaking commit', async () => {
    await write('demo', manifest(['api.example.com', 'eu.example.com']));
    await commit('feat(demo): add EU host');
    assert.deepStrictEqual(await checkRelease({ root, base: 'base' }), [
      { id: 'demo', reasons: ['adds egressHosts host eu.example.com'], ok: false },
    ]);
  });

  it('passes a breaking change with a breaking commit', async () => {
    await write('demo', manifest(['api.example.com', 'eu.example.com']));
    await commit('feat(demo)!: add EU host');
    await commit('chore: later');
    assert.deepStrictEqual(await checkRelease({ root, base: 'base' }), [
      { id: 'demo', reasons: ['adds egressHosts host eu.example.com'], ok: true },
    ]);
  });

  it('skips new connectors, folders without a manifest, and files', async () => {
    await write('fresh', manifest(['new.example.com']));
    await mkdir(join(root, 'connectors', 'empty'));
    await writeFile(join(root, 'connectors', 'README.md'), 'x');
    await commit('feat(fresh): add connector');
    assert.deepStrictEqual(await checkRelease({ root, base: 'base' }), []);
  });

  it('falls back to the folder name for the id', async () => {
    await write('demo', { egressHosts: ['other.example.com'], auth: { profile: 'basic' } });
    await commit('feat(demo): move');
    const [result] = await checkRelease({ root, base: 'base' });
    assert.strictEqual(result.id, 'demo');
  });

  it('sorts results by id', async () => {
    await write('same', manifest(['x.example.com'], 'same'));
    await write('demo', manifest(['y.example.com']));
    await commit('feat: hosts');
    assert.deepStrictEqual((await checkRelease({ root, base: 'base' })).map(({ id }) => id), ['demo', 'same']);
  });

  describe('aem-connector-check-release', () => {
    it('exits 0 when nothing needs an unmarked major', async () => {
      const { stdout } = await run(process.execPath, [BIN, root, '--base', 'base']);
      assert.match(stdout, /no connector needs an unmarked new major since base/);
    });

    it('reports a marked major on stdout', async () => {
      await write('demo', manifest(['eu.example.com']));
      await commit('feat(demo)!: EU only');
      const { stdout } = await run(process.execPath, [BIN, '--base', 'base'], { cwd: root });
      assert.match(stdout, /demo: new major \(breaking commit found\)\n {2}- adds egressHosts host eu.example.com/);
    });

    it('exits 1 and explains an unmarked major', async () => {
      await write('demo', manifest(['eu.example.com']));
      await commit('feat(demo): EU only');
      await assert.rejects(run(process.execPath, [BIN, root, '--base', 'base']), (e) => {
        assert.strictEqual(e.code, 1);
        assert.match(e.stderr, /demo: needs a new major/);
        assert.match(e.stderr, /Mark the change as breaking/);
        return true;
      });
    });

    it('exits 1 when the check cannot run', async () => {
      await assert.rejects(run(process.execPath, [BIN, join(root, 'missing')]), (e) => {
        assert.strictEqual(e.code, 1);
        assert.match(e.stderr, /ENOENT/);
        return true;
      });
    });
  });
});
