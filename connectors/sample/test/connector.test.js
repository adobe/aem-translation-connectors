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
import { readFile } from 'node:fs/promises';
import { createFakeHost, loadInteractions } from '@adobe/aem-translation-connector-sdk/testing';
import connector from '../dist/connector.js';

const manifest = JSON.parse(await readFile(new URL('../dist/connector.json', import.meta.url), 'utf-8'));
const options = { project: 'demo' };

async function hostFor(name) {
  const interactions = await loadInteractions(new URL(`fixtures/${name}.json`, import.meta.url));
  return createFakeHost({ manifest, interactions }).host;
}

describe('sample connector', () => {
  it('returns notFound when reconcile finds no job', async () => {
    const result = await connector.reconcile({ options, submissionKey: 'sub-9' }, await hostFor('reconcile-not-found'));
    assert.deepStrictEqual(result, { notFound: true });
  });

  it('reports vendor progress as a fraction', async () => {
    const result = await connector.status({ options, state: { jobId: 'job-42' } }, await hostFor('status'));
    assert.strictEqual(result.progress, 0.5);
  });

  it('maps unknown vendor states to in-progress', async () => {
    const result = await connector.status({ options, state: { jobId: 'job-42' } }, await hostFor('status-unknown'));
    assert.deepStrictEqual(result.items, [{ id: 'p1', lang: 'de', status: 'in-progress' }]);
  });

  it('passes the vendor Retry-After on rate limits', async () => {
    const result = await connector.languages({ options }, await hostFor('rate-limited'));
    assert.strictEqual(result.error.retryAfter, 30);
  });
});
