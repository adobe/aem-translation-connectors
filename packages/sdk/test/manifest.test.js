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
import { validateManifest } from '../src/index.js';

function manifest(overrides = {}) {
  return {
    id: 'sample',
    name: 'Sample',
    contract: 1,
    entry: 'connector.js',
    egressHosts: ['api.example.com'],
    credentials: [{ name: 'apiKey', required: true }],
    auth: { profile: 'api-key-header', header: 'X-Api-Key', credential: 'apiKey' },
    options: { type: 'object', properties: { project: { type: 'string' } } },
    capabilities: {
      cancel: false, maxBatchItems: 50, maxBatchBytes: 1_000_000, formats: ['html'],
    },
    ...overrides,
  };
}

const INTEGRITY = `sha384-${'A'.repeat(64)}`;

describe('validateManifest', () => {
  it('accepts a source manifest', () => {
    assert.deepStrictEqual(validateManifest(manifest()), { valid: true, errors: [] });
  });

  it('defaults capabilities.kinds to html', () => {
    const m = manifest();
    validateManifest(m);
    assert.deepStrictEqual(m.capabilities.kinds, ['html']);
  });

  it('requires version and integrity in a built manifest', () => {
    assert.deepStrictEqual(validateManifest(manifest(), { built: true }).errors, [
      '/version is required in a built manifest',
      '/integrity is required in a built manifest',
    ]);
    const built = manifest({ version: '1.2.3', integrity: INTEGRITY });
    assert.strictEqual(validateManifest(built, { built: true }).valid, true);
  });

  it('rejects unknown top-level fields', () => {
    const { valid, errors } = validateManifest(manifest({ hosting: 'x' }));
    assert.strictEqual(valid, false);
    assert.deepStrictEqual(errors, ['/ must NOT have additional properties']);
  });

  it('rejects another contract version', () => {
    assert.strictEqual(validateManifest(manifest({ contract: 2 })).valid, false);
  });

  it('rejects an unknown auth profile', () => {
    assert.strictEqual(validateManifest(manifest({ auth: { profile: 'magic' } })).valid, false);
  });

  it('accepts wildcard hosts and rejects URLs, ports, and bare wildcards', () => {
    assert.strictEqual(validateManifest(manifest({ egressHosts: ['*.example.com'] })).valid, true);
    ['https://api.example.com', 'api.example.com:443', '*', '*.com', 'API.example.com']
      .forEach((host) => {
        assert.strictEqual(validateManifest(manifest({ egressHosts: [host] })).valid, false, host);
      });
  });

  it('caps maxBatchBytes at 7 MB', () => {
    const capabilities = { ...manifest().capabilities, maxBatchBytes: 7 * 1024 * 1024 + 1 };
    assert.strictEqual(validateManifest(manifest({ capabilities })).valid, false);
  });

  it('rejects a bad integrity value', () => {
    assert.strictEqual(validateManifest(manifest({ integrity: 'sha256-abc' })).valid, false);
  });

  it('rejects options that are not a valid JSON Schema', () => {
    const { errors } = validateManifest(manifest({ options: { type: 'nope' } }));
    assert.deepStrictEqual(errors, ['/options is not a valid JSON Schema']);
  });

  it('checks submitOptions as a JSON Schema too', () => {
    const { errors } = validateManifest(manifest({ submitOptions: { required: 'x' } }));
    assert.deepStrictEqual(errors, ['/submitOptions is not a valid JSON Schema']);
  });

  it('requires signedUrlHosts and maxAssetBytes for asset kinds', () => {
    const capabilities = { ...manifest().capabilities, kinds: ['html', 'asset'] };
    assert.deepStrictEqual(validateManifest(manifest({ capabilities })).errors, [
      '/signedUrlHosts is required when capabilities.kinds includes "asset"',
      '/capabilities/maxAssetBytes is required when capabilities.kinds includes "asset"',
    ]);
    const ok = manifest({
      signedUrlHosts: ['uploads.example.com'],
      capabilities: { ...capabilities, maxAssetBytes: 5_000_000 },
    });
    assert.strictEqual(validateManifest(ok).valid, true);
  });

  it('accepts context entries', () => {
    const context = [{ name: 'glossary', required: false }, { name: 'brief' }];
    assert.strictEqual(validateManifest(manifest({ context })).valid, true);
  });
});
