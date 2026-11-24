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

const integrity = (c) => `sha384-${c.repeat(64)}`;

export function manifestFor(id, version, char = 'A') {
  return {
    id,
    version,
    name: id,
    contract: 1,
    entry: 'connector.js',
    integrity: integrity(char),
    egressHosts: ['api.example.com'],
    credentials: [],
    auth: { profile: 'bearer-static', credential: 'token' },
    options: { type: 'object' },
    capabilities: {
      cancel: false, maxBatchItems: 1, maxBatchBytes: 1000, formats: ['html'],
    },
  };
}

export function pin(version, char = 'A') {
  return { version, integrity: integrity(char) };
}

export function makeRegistry() {
  return {
    connectors: {
      sample: {
        majors: {
          1: {
            ...pin('1.4.0', 'B'),
            releasedAt: '2026-01-01T00:00:00Z',
            deprecatedAt: '2026-03-01T00:00:00Z',
            retiredAt: '2026-04-30T00:00:00Z',
            removedAt: '2026-05-30T00:00:00Z',
          },
          2: {
            ...pin('2.1.0', 'C'),
            releasedAt: '2026-03-10T00:00:00Z',
            previous: { ...pin('2.0.0', 'D'), until: '2026-03-11T00:00:00Z' },
            rollout: { ...pin('2.2.0', 'E'), orgs: ['org-a'] },
          },
        },
        manifests: {
          '1.4.0': manifestFor('sample', '1.4.0', 'B'),
          '2.0.0': manifestFor('sample', '2.0.0', 'D'),
          '2.1.0': manifestFor('sample', '2.1.0', 'C'),
          '2.2.0': manifestFor('sample', '2.2.0', 'E'),
        },
      },
    },
  };
}
