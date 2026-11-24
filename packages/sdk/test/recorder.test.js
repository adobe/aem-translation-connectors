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
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  authHeaders, createFakeHost, createRecorder, credentialEnvName, credentialsFromEnv,
  loadInteractions, saveInteractions,
} from '../src/testing/index.js';

const SECRET = 'sk-live-123456';

const manifest = {
  id: 'my-vendor',
  egressHosts: ['api.example.com'],
  signedUrlHosts: ['uploads.example.com'],
  credentials: [{ name: 'apiKey', required: true }, { name: 'region', required: false }],
  auth: { profile: 'api-key-header', header: 'x-api-key', credential: 'apiKey' },
};

const env = { CONNECTOR_MY_VENDOR_APIKEY: SECRET };

function stubFetch(responses) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, ...init });
    const next = responses.shift();
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
  return { fetch, requests };
}

describe('credentials', () => {
  it('names env vars after the connector id and field', () => {
    assert.strictEqual(credentialEnvName('my-vendor', 'apiKey'), 'CONNECTOR_MY_VENDOR_APIKEY');
  });

  it('reads credentials and skips missing optional ones', () => {
    assert.deepStrictEqual(credentialsFromEnv(manifest, env), { apiKey: SECRET });
  });

  it('lists every missing required env var', () => {
    assert.throws(() => credentialsFromEnv(manifest, {}), /CONNECTOR_MY_VENDOR_APIKEY/);
  });
});

describe('authHeaders', () => {
  it('supports api-key-header, with an optional prefix', () => {
    assert.deepStrictEqual(
      authHeaders({ profile: 'api-key-header', header: 'x-key', credential: 'k' }, { k: 'v' }),
      { 'x-key': 'v' },
    );
    assert.deepStrictEqual(
      authHeaders({
        profile: 'api-key-header', header: 'authorization', prefix: 'DeepL-Auth-Key ', credential: 'k',
      }, { k: 'v' }),
      { authorization: 'DeepL-Auth-Key v' },
    );
  });

  it('supports bearer-static and basic', () => {
    assert.deepStrictEqual(
      authHeaders({ profile: 'bearer-static', credential: 't' }, { t: 'abc' }),
      { authorization: 'Bearer abc' },
    );
    assert.deepStrictEqual(
      authHeaders({ profile: 'basic', username: 'u', password: 'p' }, { u: 'me', p: 'pw' }),
      { authorization: `Basic ${Buffer.from('me:pw').toString('base64')}` },
    );
  });

  it('refuses other profiles and missing credentials', () => {
    assert.throws(() => authHeaders({ profile: 'user-session' }, {}), /does not support/);
    assert.throws(() => authHeaders({ profile: 'bearer-static', credential: 't' }, {}), /needs credential t/);
  });
});

describe('createRecorder', () => {
  it('adds auth, calls the vendor, and records a redacted interaction', async () => {
    const { fetch, requests } = stubFetch([new Response(
      JSON.stringify({ id: 'j1', echo: SECRET }),
      { status: 201, headers: { 'content-type': 'application/json', 'set-cookie': 's=1', 'x-req': SECRET } },
    )]);
    const recorder = createRecorder({ manifest, env, fetch });
    const { host } = createFakeHost({ manifest, recorder });
    const result = await host.message({
      type: 'egress',
      method: 'POST',
      url: `https://api.example.com/jobs?key=${SECRET}`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'key-1', token: SECRET }),
    });

    assert.strictEqual(requests[0].headers['x-api-key'], SECRET);
    assert.strictEqual(result.status, 201);
    assert.strictEqual(JSON.parse(result.body).id, 'j1');
    assert.strictEqual(result.headers['set-cookie'], undefined);

    const [recorded] = recorder.interactions;
    assert.strictEqual(JSON.stringify(recorded).includes(SECRET), false);
    assert.deepStrictEqual(recorded.request, {
      method: 'POST',
      url: 'https://api.example.com/jobs?key=<redacted>',
      body: { name: 'key-1', token: '<redacted>' },
    });
    assert.strictEqual(recorded.response.headers['x-req'], '<redacted>');
  });

  it('keeps non-JSON bodies as strings and binary responses as base64', async () => {
    const { fetch } = stubFetch([new Response(new Uint8Array([0, 1, 2]), {
      status: 200, headers: { 'content-type': 'application/zip' },
    })]);
    const recorder = createRecorder({ manifest, env, fetch });
    const result = await recorder.send('egress', {
      method: 'POST', url: 'https://api.example.com/x', body: 'plain',
    });
    assert.deepStrictEqual(result, {
      status: 200, headers: { 'content-type': 'application/zip' }, body: 'AAEC', bodyEncoding: 'base64',
    });
    assert.strictEqual(recorder.interactions[0].request.body, 'plain');
  });

  it('decodes base64 request bodies on the wire and records them as sent', async () => {
    const { fetch, requests } = stubFetch([new Response(null, { status: 204 })]);
    const recorder = createRecorder({ manifest, env, fetch });
    await recorder.send('egress', {
      method: 'POST', url: 'https://api.example.com/zip', body: 'AAEC', bodyEncoding: 'base64',
    });
    assert.deepStrictEqual([...requests[0].body], [0, 1, 2]);
    assert.strictEqual(recorder.interactions[0].request.body, 'AAEC');
  });

  it('records a GET with no body', async () => {
    const { fetch } = stubFetch([new Response('ok', { headers: { 'content-type': 'text/plain' } })]);
    const recorder = createRecorder({ manifest, env, fetch });
    await recorder.send('egress', { method: 'GET', url: 'https://api.example.com/s' });
    assert.deepStrictEqual(recorder.interactions[0].request, { method: 'GET', url: 'https://api.example.com/s' });
  });

  it('keeps JSON scalars as strings', async () => {
    const { fetch } = stubFetch([new Response(null, { status: 204 })]);
    const recorder = createRecorder({ manifest, env, fetch });
    await recorder.send('egress', { method: 'POST', url: 'https://api.example.com/n', body: '42' });
    assert.strictEqual(recorder.interactions[0].request.body, '42');
  });

  it('uploads asset bytes without auth headers', async () => {
    const { fetch, requests } = stubFetch([new Response('', { status: 200 })]);
    const recorder = createRecorder({ manifest, env, fetch });
    const { host } = createFakeHost({ manifest, recorder, assets: { a1: new Uint8Array([9]) } });
    const url = 'https://uploads.example.com/put?sig=abc';
    await host.message({
      type: 'upload', itemId: 'a1', url, headers: { 'content-type': 'image/png' },
    });
    assert.deepStrictEqual(requests[0].headers, { 'content-type': 'image/png' });
    assert.deepStrictEqual([...requests[0].body], [9]);
    assert.deepStrictEqual(recorder.interactions[0].type, 'upload');
    assert.deepStrictEqual(recorder.interactions[0].request, { method: 'PUT', url });
  });

  it('returns a timeout error when the vendor is too slow', async () => {
    const timeout = new DOMException('slow', 'TimeoutError');
    const { fetch } = stubFetch([timeout]);
    const recorder = createRecorder({ manifest, env, fetch });
    const result = await recorder.send('egress', { method: 'GET', url: 'https://api.example.com/' });
    assert.strictEqual(result.error.code, 'timeout');
    assert.deepStrictEqual(recorder.interactions, []);
  });

  it('rethrows other network errors', async () => {
    const { fetch } = stubFetch([new TypeError('fetch failed')]);
    const recorder = createRecorder({ manifest, env, fetch });
    await assert.rejects(recorder.send('egress', { method: 'GET', url: 'https://api.example.com/' }), /fetch failed/);
  });
});

describe('saveInteractions', () => {
  it('writes a fixture that replays', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'connector-sdk-'));
    try {
      const { fetch } = stubFetch([new Response('{"id":"j1"}', { headers: { 'content-type': 'application/json' } })]);
      const recorder = createRecorder({ manifest, env, fetch });
      const msg = {
        type: 'egress', method: 'POST', url: 'https://api.example.com/jobs', body: '{"a":1}',
      };
      const live = await createFakeHost({ manifest, recorder }).host.message(msg);
      const file = join(dir, 'jobs.json');
      await saveInteractions(file, recorder.interactions);
      const { host } = createFakeHost({ manifest, interactions: await loadInteractions(file) });
      assert.deepStrictEqual(await host.message(msg), live);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
