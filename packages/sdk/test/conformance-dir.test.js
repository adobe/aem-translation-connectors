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
import {
  mkdir, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildConnector } from '../src/build/index.js';
import { conformance } from '../src/testing/index.js';

const API = 'https://api.example.com';

const SOURCE = `const API = '${API}';
async function get(host, path) {
  const res = await host.message({ type: 'egress', url: API + path });
  return res.error ? res : JSON.parse(res.body);
}
export default {
  async languages(_, host) {
    const res = await get(host, '/languages');
    return res.error ? res : { pairs: res.pairs };
  },
  async submit({ targets }, host) {
    const { id } = await get(host, '/new');
    return { state: { id }, jobs: [{ id, targets }] };
  },
  async status({ state }, host) {
    const { items } = await get(host, '/jobs/' + state.id);
    return { state, items };
  },
  async fetch({ state, lang, ids }, host) {
    const { html } = await get(host, '/jobs/' + state.id + '/' + lang);
    return { state, items: ids.map((id) => ({ id, lang, html })) };
  },
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
    cancel: false, maxBatchItems: 5, maxBatchBytes: 1000, formats: ['html'],
  },
};

const fixture = (path, body) => ({
  interactions: [{
    request: { url: `${API}${path}` },
    response: { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
  }],
});

async function run(opts) {
  const tests = [];
  const describe = (_, body) => body();
  const it = (name, body) => tests.push({ name, body });
  await conformance({ ...opts, describe, it });
  return tests.reduce(async (previous, test) => {
    const results = await previous;
    try {
      await test.body();
      return { ...results, [test.name]: 'pass' };
    } catch (e) {
      return { ...results, [test.name]: e.message };
    }
  }, Promise.resolve({}));
}

describe('conformance with a connector folder', () => {
  let dir;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'connector-dir-'));
    await mkdir(join(dir, 'src'));
    await mkdir(join(dir, 'test', 'fixtures'), { recursive: true });
    await writeFile(join(dir, 'connector.json'), JSON.stringify(MANIFEST));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    await writeFile(join(dir, 'src', 'connector.js'), SOURCE);
    await buildConnector({ dir });
    const write = (name, value) => writeFile(join(dir, 'test', 'fixtures', `${name}.json`), JSON.stringify(value));
    await write('languages', fixture('/languages', { pairs: 'any' }));
    await write('submit', fixture('/new', { id: 'j1' }));
    await write('status', fixture('/jobs/j1', { items: [{ id: 'p1', lang: 'de', status: 'ready' }] }));
    await write('fetch', fixture('/jobs/j1/de', { html: '<p>Hallo</p>' }));
    await write('timeout', { interactions: [{ request: { url: `${API}/languages` }, response: { error: { code: 'timeout' } } }] });
  });

  after(async () => {
    await rm(dir, { recursive: true });
  });

  const scenarios = {
    languages: 'languages',
    submit: {
      fixture: 'submit',
      input: {
        title: 't',
        items: [{
          id: 'p1', kind: 'html', html: '<p>Hi</p>', path: '/', sourceLang: 'en',
        }],
        targets: ['de'],
        submissionKey: 'k1',
      },
    },
    status: 'status',
    fetch: { fixture: 'fetch', lang: 'de' },
    errors: [{ method: 'languages', fixture: 'timeout', code: 'timeout' }],
  };

  const expected = {
    'has a valid manifest': 'pass',
    'exports the contract methods': 'pass',
    'uses no banned globals': 'pass',
    languages: 'pass',
    submit: 'pass',
    status: 'pass',
    fetch: 'pass',
    'languages: timeout': 'pass',
  };

  it('loads the built bundle, manifest, and fixtures from a folder path', async () => {
    assert.deepStrictEqual(await run({ dir, scenarios }), expected);
  });

  it('takes a folder URL, with or without a trailing slash', async () => {
    const url = pathToFileURL(dir);
    assert.deepStrictEqual(await run({ dir: url, scenarios }), expected);
    assert.deepStrictEqual(await run({ dir: new URL(`${url.href}/`), scenarios }), expected);
    assert.deepStrictEqual(await run({ dir: `${dir}/`, scenarios }), expected);
  });

  it('keeps scenarios that give interactions directly', async () => {
    const results = await run({ dir, scenarios: { ...scenarios, languages: fixture('/languages', { pairs: 'any' }) } });
    assert.strictEqual(results.languages, 'pass');
  });

  it('fails a missing scenario', async () => {
    const { languages: _, ...rest } = scenarios;
    const results = await run({ dir, scenarios: rest });
    assert.strictEqual(results.languages, 'scenario "languages" is missing');
  });

  it('runs with no scenarios', async () => {
    const results = await run({ dir });
    assert.strictEqual(results['has a valid manifest'], 'pass');
  });
});
