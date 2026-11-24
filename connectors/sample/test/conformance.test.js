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

import { readFile } from 'node:fs/promises';
import { conformance, loadInteractions } from '@adobe/aem-translation-connector-sdk/testing';
import connector from '../dist/connector.js';

const manifest = JSON.parse(await readFile(new URL('../dist/connector.json', import.meta.url), 'utf-8'));
const load = (name) => loadInteractions(new URL(`fixtures/${name}.json`, import.meta.url));

conformance({
  connector,
  manifest,
  entry: new URL('../dist/connector.js', import.meta.url),
  options: { project: 'demo' },
  scenarios: {
    languages: { interactions: await load('languages') },
    submit: {
      input: {
        title: 'Spring launch',
        items: [{
          id: 'p1',
          kind: 'html',
          html: '<main><h1>Spring launch</h1><p>Our new range is here.</p></main>',
          path: '/spring',
          sourceLang: 'en',
        }],
        targets: ['de', 'fr'],
        dueDate: '2026-12-01',
        submissionKey: 'sub-1',
      },
      interactions: await load('submit'),
    },
    status: { interactions: await load('status') },
    fetch: { lang: 'de', interactions: await load('fetch') },
    cancel: { lang: 'fr', interactions: await load('cancel') },
    reconcile: { interactions: await load('reconcile') },
    errors: [
      { method: 'languages', interactions: await load('auth-failed'), code: 'auth-failed' },
      { method: 'languages', interactions: await load('rate-limited'), code: 'rate-limited' },
      { method: 'languages', interactions: await load('vendor-error'), code: 'vendor-error' },
      { method: 'languages', interactions: await load('timeout'), code: 'timeout' },
      {
        method: 'submit',
        input: {
          title: 'Spring launch', items: [], targets: ['de'], submissionKey: 'sub-1',
        },
        interactions: await load('submit-invalid'),
        code: 'invalid-content',
      },
      {
        method: 'status', input: { state: { jobId: 'job-404' } }, interactions: await load('status-not-found'), code: 'not-found',
      },
      {
        method: 'fetch', input: { state: { jobId: 'job-42' }, lang: 'de', ids: ['p1'] }, interactions: await load('fetch-forbidden'), code: 'auth-failed',
      },
      {
        method: 'cancel', input: { state: { jobId: 'job-42' } }, interactions: await load('cancel-vendor-error'), code: 'vendor-error',
      },
      {
        method: 'reconcile', input: { submissionKey: 'sub-1' }, interactions: await load('reconcile-error'), code: 'vendor-error',
      },
    ],
  },
});
