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
  createFakeHost, hostMatches, HostPolicyError, loadInteractions,
} from '../src/testing/fake-host.js';

const manifest = {
  egressHosts: ['api.example.com', '*.vendor.example'],
  signedUrlHosts: ['uploads.example.com'],
};

function get(url, response) {
  return { request: { url }, response };
}

describe('hostMatches', () => {
  it('matches exact hosts and wildcard subdomains', () => {
    const patterns = ['api.example.com', '*.vendor.example'];
    assert.strictEqual(hostMatches('api.example.com', patterns), true);
    assert.strictEqual(hostMatches('eu.vendor.example', patterns), true);
    assert.strictEqual(hostMatches('a.b.vendor.example', patterns), true);
    assert.strictEqual(hostMatches('vendor.example', patterns), false);
    assert.strictEqual(hostMatches('evilvendor.example', patterns), false);
    assert.strictEqual(hostMatches('api.example.com.evil.test', patterns), false);
    assert.strictEqual(hostMatches('api.example.com'), false);
  });
});

describe('createFakeHost', () => {
  it('replays responses in order', async () => {
    const url = 'https://api.example.com/jobs/1';
    const { host, pending } = createFakeHost({
      manifest,
      interactions: [
        get(url, { status: 200, body: 'in-progress' }),
        get(url, { status: 200, body: 'ready' }),
      ],
    });
    assert.strictEqual((await host.message({ type: 'egress', url })).body, 'in-progress');
    assert.strictEqual((await host.message({ type: 'egress', url })).body, 'ready');
    assert.deepStrictEqual(pending(), []);
    await assert.rejects(host.message({ type: 'egress', url }), /no recorded egress response/);
  });

  it('matches method and JSON body, and lowercases headers', async () => {
    const interactions = await loadInteractions(new URL('fixtures/interactions.json', import.meta.url));
    const { host } = createFakeHost({ manifest, interactions });
    const msg = { type: 'egress', method: 'post', url: 'https://api.example.com/jobs' };
    await assert.rejects(host.message({ ...msg, body: '{"name":"other"}' }), /no recorded/);
    await assert.rejects(host.message({ ...msg, body: 'not json' }), /no recorded/);
    await assert.rejects(host.message(msg), /no recorded/);
    assert.deepStrictEqual(await host.message({ ...msg, body: '{ "name": "key-1" }' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"id":"j1"}',
    });
  });

  it('matches string bodies exactly', async () => {
    const url = 'https://api.example.com/raw';
    const { host } = createFakeHost({
      manifest,
      interactions: [{ request: { method: 'PUT', url, body: 'abc' }, response: { status: 204 } }],
    });
    await assert.rejects(host.message({
      type: 'egress', method: 'PUT', url, body: 'abcd',
    }), /no recorded/);
    assert.deepStrictEqual(await host.message({
      type: 'egress', method: 'PUT', url, body: 'abc',
    }), { status: 204, headers: {}, body: '' });
  });

  it('keeps the response body encoding', async () => {
    const url = 'https://api.example.com/zip';
    const { host } = createFakeHost({
      manifest,
      interactions: [get(url, { status: 200, body: 'UEsD', bodyEncoding: 'base64' })],
    });
    assert.strictEqual((await host.message({ type: 'egress', url })).bodyEncoding, 'base64');
  });

  it('simulates host errors', async () => {
    const url = 'https://api.example.com/slow';
    const { host } = createFakeHost({
      manifest,
      interactions: [get(url, { error: { code: 'timeout' } }), get(url, { error: { code: 'nope' } })],
    });
    assert.deepStrictEqual(
      await host.message({ type: 'egress', url }),
      { error: { code: 'timeout', message: 'timeout' } },
    );
    await assert.rejects(host.message({ type: 'egress', url }), /not a host error code/);
  });

  it('enforces egressHosts and https', async () => {
    const { host } = createFakeHost({ manifest });
    await assert.rejects(host.message({ type: 'egress', url: 'https://other.test/' }), HostPolicyError);
    await assert.rejects(host.message({ type: 'egress', url: 'http://api.example.com/' }), /only https/);
    await assert.rejects(host.message({ type: 'egress', url: 'not a url' }), /invalid url/);
  });

  it('returns payload-too-large for bodies over 10 MB', async () => {
    const { host } = createFakeHost({ manifest });
    const body = 'x'.repeat(10 * 1024 * 1024 + 1);
    assert.strictEqual(
      (await host.message({
        type: 'egress', method: 'POST', url: 'https://api.example.com/', body,
      })).error.code,
      'payload-too-large',
    );
  });

  it('rejects unknown body encodings', async () => {
    const { host } = createFakeHost({ manifest });
    await assert.rejects(host.message({
      type: 'egress', url: 'https://api.example.com/', body: 'x', bodyEncoding: 'hex',
    }), /unknown body encoding/);
  });

  it('replays uploads to signed URL hosts for known assets', async () => {
    const url = 'https://uploads.example.com/signed?sig=1';
    const { host } = createFakeHost({
      manifest,
      assets: { a1: new Uint8Array([1, 2]) },
      interactions: [{ type: 'upload', request: { method: 'PUT', url }, response: { status: 200 } }],
    });
    await assert.rejects(host.message({ type: 'upload', itemId: 'zz', url }), /unknown asset item/);
    await assert.rejects(host.message({
      type: 'upload', itemId: 'a1', url: 'https://api.example.com/x',
    }), /not in signedUrlHosts/);
    assert.strictEqual((await host.message({ type: 'upload', itemId: 'a1', url })).status, 200);
  });

  it('rejects uploads when the manifest has no signedUrlHosts', async () => {
    const { host } = createFakeHost({
      manifest: { egressHosts: [] },
      assets: { a1: new Uint8Array() },
    });
    await assert.rejects(host.message({ type: 'upload', itemId: 'a1', url: 'https://x.test/' }), HostPolicyError);
  });

  it('collects logs with their data and records every call', async () => {
    const { host, logs, calls } = createFakeHost({ manifest });
    assert.deepStrictEqual(await host.message({
      type: 'log', level: 'info', message: 'hi', data: { jobId: 'j1' },
    }), {});
    await assert.rejects(host.message({ type: 'log', level: 'loud', message: 'x' }), /unknown log level/);
    assert.deepStrictEqual(logs, [{ level: 'info', message: 'hi', data: { jobId: 'j1' } }]);
    assert.strictEqual(calls.length, 2);
  });

  it('returns unsupported-message for unknown message types', async () => {
    const { host } = createFakeHost({ manifest });
    assert.deepStrictEqual(await host.message({ type: 'fetch' }), {
      error: { code: 'unsupported-message', message: 'unknown host message type: fetch' },
    });
    assert.strictEqual((await host.message(null)).error.code, 'unsupported-message');
  });
});

describe('loadInteractions', () => {
  it('rejects files without an interactions array', async () => {
    await assert.rejects(
      loadInteractions(new URL('../package.json', import.meta.url)),
      /interactions must be an array/,
    );
  });
});
