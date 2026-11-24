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
  checkCancel, checkErrorResult, checkFetch, checkLanguages, checkModule, checkReconcile,
  checkState, checkStatus, checkSubmit,
} from '../src/testing/checks.js';

const fn = async () => ({});
const caps = {
  cancel: false, maxBatchItems: 2, maxBatchBytes: 100, formats: ['html'], kinds: ['html'],
};

describe('checkModule', () => {
  it('accepts the required methods', () => {
    const connector = {
      languages: fn, submit: fn, status: fn, fetch: fn,
    };
    assert.deepStrictEqual(checkModule(connector, { capabilities: caps }), []);
  });

  it('reports missing methods and a bad optional method', () => {
    assert.deepStrictEqual(checkModule({ reconcile: 1 }, { capabilities: caps }), [
      'languages must be a function',
      'submit must be a function',
      'status must be a function',
      'fetch must be a function',
      'reconcile must be a function when present',
    ]);
  });

  it('matches cancel to capabilities.cancel', () => {
    const connector = {
      languages: fn, submit: fn, status: fn, fetch: fn, cancel: fn,
    };
    assert.deepStrictEqual(checkModule(connector, { capabilities: caps }), [
      'capabilities.cancel is false but cancel is defined',
    ]);
    delete connector.cancel;
    assert.deepStrictEqual(checkModule(connector, { capabilities: { ...caps, cancel: true } }), [
      'capabilities.cancel is true but cancel is not defined',
    ]);
  });

  it('rejects a non-object export', () => {
    assert.deepStrictEqual(checkModule(fn, {}), ['the default export must be an object']);
  });
});

describe('checkState', () => {
  it('accepts plain JSON objects', () => {
    assert.deepStrictEqual(checkState({ jobId: 'j1', cursor: 3 }), []);
  });

  it('rejects non-objects, non-JSON, and lossy values', () => {
    assert.deepStrictEqual(checkState('x'), ['state must be an object']);
    const cyclic = {};
    cyclic.self = cyclic;
    assert.match(checkState(cyclic)[0], /state must be JSON/);
    assert.deepStrictEqual(checkState({ when: new Date(0) }), [
      'state must survive a JSON round trip unchanged',
    ]);
  });

  it('caps state at 64 KB', () => {
    assert.match(checkState({ big: 'x'.repeat(64 * 1024) })[0], /over the 65536 byte cap/);
  });

  it('rejects state that holds item content', () => {
    const html = '<p>This is the full content of a page.</p>';
    assert.deepStrictEqual(
      checkState({ copy: html }, [{ id: 'p1', html }, { id: 'p2', html: '<p>short</p>' }]),
      ['state contains the content of item p1'],
    );
  });
});

describe('checkErrorResult', () => {
  it('accepts connector and host codes', () => {
    assert.deepStrictEqual(checkErrorResult({ error: { code: 'rate-limited', message: 'x', retryAfter: 5 } }), []);
    assert.deepStrictEqual(checkErrorResult({ error: { code: 'timeout', message: 'x' } }, 'timeout'), []);
  });

  it('reports bad shapes, codes, and retryAfter', () => {
    assert.deepStrictEqual(checkErrorResult({ state: {} }), ['expected an error result']);
    assert.deepStrictEqual(checkErrorResult({ error: { code: 'oops', retryAfter: -1 } }, 'auth-failed'), [
      'unknown error code: oops',
      'error.message must be a string',
      'error.retryAfter must be a number of seconds',
      'expected error code auth-failed, got oops',
    ]);
  });
});

describe('checkLanguages', () => {
  it('accepts pairs or any', () => {
    assert.deepStrictEqual(checkLanguages({ pairs: 'any' }), []);
    assert.deepStrictEqual(checkLanguages({ pairs: [{ source: 'en', targets: ['de'] }] }), []);
  });

  it('reports bad results', () => {
    assert.deepStrictEqual(checkLanguages({ error: { code: 'auth-failed', message: 'no' } }), [
      'unexpected error: auth-failed: no',
    ]);
    assert.deepStrictEqual(checkLanguages(null), ['result must be an object']);
    assert.deepStrictEqual(checkLanguages({ pairs: {} }), ['pairs must be an array or "any"']);
    assert.deepStrictEqual(checkLanguages({ pairs: [{ source: 'en', targets: [] }] }), [
      'pairs[0] must be { source, targets: [lang] }',
    ]);
  });
});

describe('checkSubmit', () => {
  const input = { items: [{ id: 'p1', html: '' }], targets: ['de', 'fr'] };

  it('accepts jobs that cover every target', () => {
    const result = { state: { id: 'j1' }, jobs: [{ id: 'j1', targets: ['de'] }, { id: 'j2', targets: ['fr'] }] };
    assert.deepStrictEqual(checkSubmit(result, input), []);
  });

  it('reports bad jobs and uncovered targets', () => {
    assert.deepStrictEqual(checkSubmit({ error: { code: 'vendor-error', message: 'x' } }, input), [
      'unexpected error: vendor-error: x',
    ]);
    assert.deepStrictEqual(checkSubmit([], input), ['result must be an object']);
    assert.deepStrictEqual(checkSubmit({ state: {}, jobs: [] }, input), ['jobs must be a non-empty array']);
    assert.deepStrictEqual(checkSubmit({ state: {}, jobs: [null, { id: 'j', targets: ['de', 'es'] }] }, input), [
      'jobs[0] must be { id, targets: [lang] }',
      'jobs[1] has target es, which was not requested',
      'no job covers target fr',
    ]);
  });
});

describe('checkStatus', () => {
  const ctx = { ids: ['p1'], targets: ['de'] };

  it('accepts known items and progress', () => {
    const result = { state: {}, items: [{ id: 'p1', lang: 'de', status: 'ready' }], progress: 100 };
    assert.deepStrictEqual(checkStatus(result, ctx), []);
  });

  it('reports bad items and progress', () => {
    assert.deepStrictEqual(checkStatus({ error: { code: 'not-found', message: 'x' } }, ctx), [
      'unexpected error: not-found: x',
    ]);
    assert.deepStrictEqual(checkStatus(1, ctx), ['result must be an object']);
    assert.deepStrictEqual(checkStatus({ state: {} }, ctx), ['items must be an array']);
    const result = {
      state: {},
      items: [null, { id: 'p9', lang: 'xx', status: 'done' }],
      progress: 101,
    };
    assert.deepStrictEqual(checkStatus(result, ctx), [
      'items[0] must be an object',
      'items[1] has unknown id p9',
      'items[1] has unknown lang xx',
      'items[1] has unknown status done',
      'progress must be a number from 0 to 100',
    ]);
  });
});

describe('checkFetch', () => {
  const ctx = { lang: 'de', ids: ['p1', 'a1'] };

  it('accepts html and url items', () => {
    const result = {
      state: {},
      items: [
        { id: 'p1', lang: 'de', html: '<p>Hallo</p>' },
        {
          id: 'a1', lang: 'de', url: 'https://x.test/a', contentType: 'image/png',
        },
      ],
    };
    assert.deepStrictEqual(checkFetch(result, ctx), []);
  });

  it('reports bad items', () => {
    assert.deepStrictEqual(checkFetch({ error: { code: 'not-found', message: 'x' } }, ctx), [
      'unexpected error: not-found: x',
    ]);
    assert.deepStrictEqual(checkFetch(null, ctx), ['result must be an object']);
    assert.deepStrictEqual(checkFetch({ state: {} }, ctx), ['items must be an array']);
    const result = {
      state: {},
      items: [null, { id: 'p9', lang: 'fr' }, {
        id: 'p1', lang: 'de', html: '', url: 'u', contentType: 'c',
      }],
    };
    assert.deepStrictEqual(checkFetch(result, ctx), [
      'items[0] must be an object',
      'items[1] has id p9, which was not requested',
      'items[1] has lang fr, expected de',
      'items[1] must have either html, or url and contentType',
      'items[2] must have either html, or url and contentType',
    ]);
  });
});

describe('checkReconcile and checkCancel', () => {
  it('accept state or notFound', () => {
    assert.deepStrictEqual(checkReconcile({ state: { id: 'j1' } }), []);
    assert.deepStrictEqual(checkReconcile({ notFound: true }), []);
    assert.deepStrictEqual(checkCancel({ state: {} }), []);
  });

  it('report bad results', () => {
    assert.deepStrictEqual(checkReconcile(null), ['result must be an object']);
    assert.deepStrictEqual(checkReconcile({}), ['state must be an object']);
    assert.deepStrictEqual(checkReconcile({ error: { code: 'auth-failed', message: 'x' } }), [
      'unexpected error: auth-failed: x',
    ]);
    assert.deepStrictEqual(checkCancel(null), ['result must be an object']);
    assert.deepStrictEqual(checkCancel({ error: { code: 'auth-failed', message: 'x' } }), [
      'unexpected error: auth-failed: x',
    ]);
  });
});
