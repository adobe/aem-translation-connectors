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

import { connectorError } from '@adobe/aem-translation-connector-sdk';

const API = 'https://api.sample.example.com/v1';

const STATUSES = {
  new: 'queued',
  translating: 'in-progress',
  done: 'ready',
  error: 'failed',
  cancelled: 'cancelled',
};

async function call(host, method, path, body) {
  const res = await host.message({
    type: 'egress',
    method,
    url: `${API}${path}`,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.error) {
    return res;
  }
  if (res.status === 401 || res.status === 403) {
    return connectorError('auth-failed', 'the vendor rejected the API key');
  }
  if (res.status === 429) {
    return connectorError('rate-limited', 'too many requests', {
      retryAfter: Number(res.headers['retry-after'] ?? 60),
    });
  }
  if (res.status === 404) {
    return connectorError('not-found', `${method} ${path} was not found`);
  }
  if (res.status === 400 || res.status === 422) {
    return connectorError('invalid-content', res.body);
  }
  if (res.status >= 400) {
    return connectorError('vendor-error', `vendor returned ${res.status}`);
  }
  return { data: res.body ? JSON.parse(res.body) : {} };
}

async function languages({ options }, host) {
  const res = await call(host, 'GET', `/projects/${options.project}/languages`);
  if (res.error) {
    return res;
  }
  return { pairs: res.data.pairs.map(({ from, to }) => ({ source: from, targets: to })) };
}

async function submit({
  options, title, items, targets, dueDate, submissionKey,
}, host) {
  const res = await call(host, 'POST', `/projects/${options.project}/jobs`, {
    name: submissionKey,
    title,
    due: dueDate,
    targets,
    documents: items.map(({
      id, html, path, sourceLang,
    }) => ({
      id, html, path, source: sourceLang,
    })),
  });
  if (res.error) {
    return res;
  }
  return { state: { jobId: res.data.id }, jobs: [{ id: res.data.id, targets }] };
}

async function reconcile({ options, submissionKey }, host) {
  const res = await call(host, 'GET', `/projects/${options.project}/jobs?name=${encodeURIComponent(submissionKey)}`);
  if (res.error) {
    return res;
  }
  const [job] = res.data.jobs;
  return job ? { state: { jobId: job.id } } : { notFound: true };
}

async function status({ options, state }, host) {
  const res = await call(host, 'GET', `/projects/${options.project}/jobs/${state.jobId}`);
  if (res.error) {
    return res;
  }
  return {
    state,
    items: res.data.documents.map(({ id, lang, state: s }) => ({
      id, lang, status: STATUSES[s] ?? 'in-progress',
    })),
    progress: res.data.progress === undefined ? undefined : res.data.progress / 100,
  };
}

async function fetch({
  options, state, lang, ids,
}, host) {
  const query = ids.map(encodeURIComponent).join(',');
  const res = await call(host, 'GET', `/projects/${options.project}/jobs/${state.jobId}/translations/${lang}?ids=${query}`);
  if (res.error) {
    return res;
  }
  return { state, items: res.data.documents.map(({ id, html }) => ({ id, lang, html })) };
}

async function cancel({ options, state, lang }, host) {
  const suffix = lang ? `?lang=${lang}` : '';
  const res = await call(host, 'POST', `/projects/${options.project}/jobs/${state.jobId}/cancel${suffix}`);
  if (res.error) {
    return res;
  }
  return { state };
}

export default {
  languages, submit, reconcile, status, fetch, cancel,
};
