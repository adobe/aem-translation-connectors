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
import { registerSuite as conformance } from '../src/testing/conformance.js';

const API = 'https://api.example.com';
const HTML = '<p>The full content of the page to translate.</p>';

const manifest = {
  id: 'demo',
  name: 'Demo',
  contract: 1,
  entry: 'connector.js',
  egressHosts: ['api.example.com'],
  credentials: [{ name: 'apiKey', required: true }],
  auth: { profile: 'api-key-header', header: 'x-api-key', credential: 'apiKey' },
  options: { type: 'object' },
  capabilities: {
    cancel: true, maxBatchItems: 10, maxBatchBytes: 100_000, formats: ['html'],
  },
};

async function json(host, method, path, body) {
  const res = await host.message({
    type: 'egress', method, url: `${API}${path}`, body: body && JSON.stringify(body),
  });
  return res.error ? res : JSON.parse(res.body);
}

function makeConnector(overrides = {}) {
  return {
    async languages(_, host) {
      const res = await json(host, 'GET', '/languages');
      return res.error ? res : { pairs: res.pairs };
    },
    async submit({ items, targets, submissionKey }, host) {
      const { id } = await json(host, 'POST', '/jobs', { name: submissionKey, count: items.length });
      return { state: { jobId: id }, jobs: [{ id, targets }] };
    },
    async status({ state }, host) {
      const { items } = await json(host, 'GET', `/jobs/${state.jobId}`);
      return { state, items, progress: 50 };
    },
    async fetch({ state, lang, ids }, host) {
      const { pages } = await json(host, 'GET', `/jobs/${state.jobId}/${lang}`);
      return { state, items: ids.map((id) => ({ id, lang, html: pages[id] })) };
    },
    async cancel({ state }, host) {
      await json(host, 'POST', `/jobs/${state.jobId}/cancel`);
      return { state };
    },
    async reconcile({ submissionKey }, host) {
      const { jobs } = await json(host, 'GET', `/jobs?name=${submissionKey}`);
      return jobs.length ? { state: { jobId: jobs[0] } } : { notFound: true };
    },
    ...overrides,
  };
}

const ok = (path, body, method = 'GET', requestBody = undefined) => ({
  request: { method, url: `${API}${path}`, ...(requestBody ? { body: requestBody } : {}) },
  response: { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
});

function makeScenarios() {
  return {
    languages: { interactions: [ok('/languages', { pairs: [{ source: 'en', targets: ['de'] }] })] },
    submit: {
      input: {
        title: 'Spring launch',
        items: [{
          id: 'p1', kind: 'html', html: HTML, path: '/index', sourceLang: 'en',
        }],
        targets: ['de'],
        submissionKey: 'key-1',
      },
      interactions: [ok('/jobs', { id: 'j1' }, 'POST', { name: 'key-1', count: 1 })],
    },
    status: { interactions: [ok('/jobs/j1', { items: [{ id: 'p1', lang: 'de', status: 'ready' }] })] },
    fetch: { interactions: [ok('/jobs/j1/de', { pages: { p1: '<p>Der Inhalt.</p>' } })] },
    cancel: { interactions: [ok('/jobs/j1/cancel', {}, 'POST')] },
    reconcile: { interactions: [ok('/jobs?name=key-1', { jobs: ['j1'] })] },
    errors: [{
      name: 'bad key',
      method: 'languages',
      interactions: [{ request: { url: `${API}/languages` }, response: { error: { code: 'vendor-sign-in-required' } } }],
      code: 'vendor-sign-in-required',
    }],
  };
}

async function run(opts) {
  const tests = [];
  const path = [];
  const describe = (name, body) => {
    path.push(name);
    body();
    path.pop();
  };
  const it = (name, body) => tests.push({ name: [...path.slice(1), name].join(' > '), body });
  conformance({
    manifest, connector: makeConnector(), scenarios: makeScenarios(), describe, it, ...opts,
  });
  const results = {};
  for (const test of tests) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await test.body();
      results[test.name] = 'pass';
    } catch (e) {
      results[test.name] = e.message;
    }
  }
  return results;
}

describe('conformance', () => {
  it('passes a conforming connector', async () => {
    assert.deepStrictEqual(await run({
      entry: new URL('../src/errors.js', import.meta.url),
      allowImports: true,
    }), {
      'module > has a valid manifest': 'pass',
      'module > exports the contract methods': 'pass',
      'module > uses no banned globals': 'pass',
      'methods > languages': 'pass',
      'methods > submit': 'pass',
      'methods > status': 'pass',
      'methods > fetch': 'pass',
      'methods > cancel': 'pass',
      'methods > reconcile': 'pass',
      'errors > languages: bad key': 'pass',
    });
  });

  it('skips cancel and reconcile when the connector has neither', async () => {
    const connector = makeConnector();
    delete connector.cancel;
    delete connector.reconcile;
    const results = await run({
      connector,
      manifest: { ...manifest, capabilities: { ...manifest.capabilities, cancel: false } },
    });
    assert.strictEqual(results['methods > cancel'], undefined);
    assert.strictEqual(results['methods > reconcile'], undefined);
    assert.strictEqual(results['module > uses no banned globals'], undefined);
    assert.strictEqual(results['methods > fetch'], 'pass');
  });

  it('fails when state carries content', async () => {
    const connector = makeConnector({
      async submit({ items, targets }, host) {
        await json(host, 'POST', '/jobs', { name: 'key-1', count: 1 });
        return { state: { copy: items[0].html }, jobs: [{ id: 'j1', targets }] };
      },
    });
    const results = await run({ connector });
    assert.strictEqual(results['methods > submit'], 'state contains the content of item p1');
    assert.strictEqual(results['methods > status'], 'needs a passing submit');
    assert.strictEqual(results['methods > fetch'], 'needs a passing submit');
    assert.strictEqual(results['methods > cancel'], 'needs a passing submit');
  });

  it('fails when a recorded interaction is not used', async () => {
    const scenarios = makeScenarios();
    scenarios.languages.interactions.push(ok('/extra', {}));
    const results = await run({ scenarios });
    assert.strictEqual(results['methods > languages'], 'languages: 1 recorded interactions were not used');
  });

  it('fails when a scenario is missing', async () => {
    const scenarios = makeScenarios();
    delete scenarios.languages;
    const results = await run({ scenarios });
    assert.strictEqual(results['methods > languages'], 'scenario "languages" is missing');
  });

  it('fails when an egress body is over 10 MB', async () => {
    const connector = makeConnector({
      async languages(_, host) {
        await host.message({
          type: 'egress', method: 'POST', url: `${API}/big`, body: 'x'.repeat(10 * 1024 * 1024 + 1),
        });
        return { pairs: 'any' };
      },
    });
    const scenarios = makeScenarios();
    scenarios.languages.interactions = [];
    const results = await run({ connector, scenarios });
    assert.strictEqual(results['methods > languages'], 'languages: sent an egress body over 10 MB');
  });

  it('fails an error scenario with the wrong code', async () => {
    const scenarios = makeScenarios();
    scenarios.errors[0].code = 'auth-failed';
    const results = await run({ scenarios });
    assert.strictEqual(results['errors > languages: bad key'], 'expected error code auth-failed, got vendor-sign-in-required');
  });

  it('names an error scenario by its code when it has no name', async () => {
    const scenarios = makeScenarios();
    delete scenarios.errors[0].name;
    const results = await run({ scenarios });
    assert.strictEqual(results['errors > languages: vendor-sign-in-required'], 'pass');
  });

  it('fails the module checks for a bad manifest and banned globals', async () => {
    const results = await run({
      manifest: { ...manifest, id: undefined, contract: 2 },
      entry: new URL('../src/testing/fake-host.js', import.meta.url),
    });
    assert.match(results['module > has a valid manifest'], /contract must be equal to constant/);
    assert.match(results['module > uses no banned globals'], /import of "node:fs\/promises"/);
  });

  it('runs without scenarios for errors and with defaults for fetch', async () => {
    const scenarios = makeScenarios();
    delete scenarios.errors;
    scenarios.fetch.lang = 'de';
    scenarios.fetch.ids = ['p1'];
    const results = await run({ scenarios });
    assert.strictEqual(results['methods > fetch'], 'pass');
    assert.strictEqual(Object.keys(results).some((k) => k.startsWith('errors')), false);
  });

  it('fails a call that takes too long', async () => {
    const connector = makeConnector({ languages: () => new Promise(() => {}) });
    const results = await run({ connector, timeoutMs: 20 });
    assert.strictEqual(results['methods > languages'], 'languages took over 20 ms');
  });
});
