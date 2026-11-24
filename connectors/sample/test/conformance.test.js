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

import { conformance } from '@adobe/aem-translation-connector-sdk/testing';

await conformance({
  dir: new URL('..', import.meta.url),
  options: { project: 'demo' },
  scenarios: {
    languages: 'languages',
    submit: {
      fixture: 'submit',
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
    },
    status: 'status',
    fetch: { fixture: 'fetch', lang: 'de' },
    cancel: { fixture: 'cancel', lang: 'fr' },
    reconcile: 'reconcile',
    errors: [
      { method: 'languages', fixture: 'auth-failed', code: 'auth-failed' },
      { method: 'languages', fixture: 'rate-limited', code: 'rate-limited' },
      { method: 'languages', fixture: 'vendor-error', code: 'vendor-error' },
      { method: 'languages', fixture: 'timeout', code: 'timeout' },
      {
        method: 'submit',
        fixture: 'submit-invalid',
        code: 'invalid-content',
        input: {
          title: 'Spring launch', items: [], targets: ['de'], submissionKey: 'sub-1',
        },
      },
      {
        method: 'status', fixture: 'status-not-found', code: 'not-found', input: { state: { jobId: 'job-404' } },
      },
      {
        method: 'fetch', fixture: 'fetch-forbidden', code: 'auth-failed', input: { state: { jobId: 'job-42' }, lang: 'de', ids: ['p1'] },
      },
      {
        method: 'cancel', fixture: 'cancel-vendor-error', code: 'vendor-error', input: { state: { jobId: 'job-42' } },
      },
      {
        method: 'reconcile', fixture: 'reconcile-error', code: 'vendor-error', input: { submissionKey: 'sub-1' },
      },
    ],
  },
});
