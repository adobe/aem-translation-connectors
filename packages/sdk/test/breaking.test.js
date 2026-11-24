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
import { breakingChanges, isBreakingCommit } from '../src/release/index.js';

const base = {
  egressHosts: ['api.example.com'],
  credentials: [{ name: 'apiKey', required: true }, { name: 'region' }],
  auth: { profile: 'api-key-header', header: 'x-api-key', credential: 'apiKey' },
  options: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'] },
  capabilities: { kinds: ['html', 'asset'] },
};

const change = (patch) => breakingChanges(base, { ...base, ...patch });

describe('breakingChanges', () => {
  it('finds nothing for the same manifest', () => {
    assert.deepStrictEqual(breakingChanges(base, structuredClone(base)), []);
  });

  it('allows changes that keep the major', () => {
    assert.deepStrictEqual(change({
      egressHosts: [],
      credentials: [...base.credentials, { name: 'extra', required: false }],
      auth: { ...base.auth, header: 'x-key' },
      options: { ...base.options, properties: { ...base.options.properties, tone: { type: 'string' } } },
      capabilities: { kinds: ['html', 'asset', 'external'] },
    }), []);
  });

  it('flags new hosts', () => {
    assert.deepStrictEqual(change({
      egressHosts: ['api.example.com', '*.eu.example.com'],
      signedUrlHosts: ['uploads.example.com'],
    }), [
      'adds egressHosts host *.eu.example.com',
      'adds signedUrlHosts host uploads.example.com',
    ]);
  });

  it('flags new and newly required credentials', () => {
    assert.deepStrictEqual(change({
      credentials: [
        { name: 'apiKey', required: true }, { name: 'region', required: true }, { name: 'secret', required: true },
      ],
    }), ['adds required credential region', 'adds required credential secret']);
  });

  it('flags new required options', () => {
    assert.deepStrictEqual(change({ options: { ...base.options, required: ['project', 'tone'] } }), [
      'adds required option tone',
    ]);
    assert.deepStrictEqual(breakingChanges({ ...base, options: {} }, base), ['adds required option project']);
  });

  it('flags a changed auth profile', () => {
    assert.deepStrictEqual(change({ auth: { profile: 'bearer-static', credential: 'apiKey' } }), [
      'changes auth.profile from api-key-header to bearer-static',
    ]);
  });

  it('flags removed kinds, with html as the default', () => {
    assert.deepStrictEqual(change({ capabilities: { kinds: ['html'] } }), ['removes kind asset']);
    assert.deepStrictEqual(change({ capabilities: {} }), ['removes kind asset']);
    assert.deepStrictEqual(breakingChanges({}, { capabilities: { kinds: ['asset'] } }), ['removes kind html']);
  });
});

describe('isBreakingCommit', () => {
  it('detects ! and BREAKING CHANGE footers', () => {
    assert.strictEqual(isBreakingCommit('feat(deepl)!: use the v3 API'), true);
    assert.strictEqual(isBreakingCommit('fix!: drop the old host'), true);
    assert.strictEqual(isBreakingCommit('feat(deepl): x\n\nBREAKING CHANGE: new host'), true);
    assert.strictEqual(isBreakingCommit('feat(deepl): x\n\nBREAKING-CHANGE: new host'), true);
    assert.strictEqual(isBreakingCommit('feat(deepl): mention a breaking change in text'), false);
    assert.strictEqual(isBreakingCommit(''), false);
  });
});
