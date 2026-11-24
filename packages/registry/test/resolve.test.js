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
import { isAccepted, resolveConnector } from '../src/index.js';
import { makeRegistry, pin } from './helpers.js';

const at = (iso) => new Date(iso);

describe('resolveConnector', () => {
  const registry = makeRegistry();

  it('returns the current version of a major', () => {
    const result = resolveConnector(registry, { id: 'sample', major: 2, now: at('2026-03-20T00:00:00Z') });
    assert.deepStrictEqual({ ...result, manifest: result.manifest.version }, {
      id: 'sample',
      major: 2,
      ...pin('2.1.0', 'C'),
      manifest: '2.1.0',
      stage: 'active',
      canSubmit: true,
    });
  });

  it('returns the rollout version to orgs in the rollout', () => {
    const now = at('2026-03-20T00:00:00Z');
    assert.strictEqual(resolveConnector(registry, {
      id: 'sample', major: '2', org: 'org-a', now,
    }).version, '2.2.0');
    assert.strictEqual(resolveConnector(registry, {
      id: 'sample', major: 2, org: 'org-b', now,
    }).version, '2.1.0');
  });

  it('reports deprecated and retired majors', () => {
    const deprecated = resolveConnector(registry, { id: 'sample', major: 1, now: at('2026-03-20T00:00:00Z') });
    assert.deepStrictEqual([deprecated.stage, deprecated.canSubmit], ['deprecated', true]);
    const retired = resolveConnector(registry, { id: 'sample', major: 1, now: at('2026-05-01T00:00:00Z') });
    assert.deepStrictEqual([retired.stage, retired.canSubmit], ['retired', false]);
  });

  it('returns null for removed, unknown, and missing majors', () => {
    assert.strictEqual(resolveConnector(registry, { id: 'sample', major: 1, now: at('2026-06-01T00:00:00Z') }), null);
    assert.strictEqual(resolveConnector(registry, { id: 'sample', major: 3 }), null);
    assert.strictEqual(resolveConnector(registry, { id: 'other', major: 1 }), null);
    assert.strictEqual(resolveConnector({}, { id: 'sample', major: 1 }), null);
  });

  it('defaults now to the current time', () => {
    assert.strictEqual(resolveConnector(registry, { id: 'sample', major: 1 }), null);
  });
});

describe('isAccepted', () => {
  const registry = makeRegistry();
  const q = (version, char, extra = {}) => ({
    id: 'sample', major: 2, ...pin(version, char), now: at('2026-03-10T12:00:00Z'), ...extra,
  });

  it('accepts the current version', () => {
    assert.strictEqual(isAccepted(registry, q('2.1.0', 'C')), true);
  });

  it('rejects a matching version with the wrong integrity', () => {
    assert.strictEqual(isAccepted(registry, q('2.1.0', 'Z')), false);
  });

  it('accepts the previous version until its window closes', () => {
    assert.strictEqual(isAccepted(registry, q('2.0.0', 'D')), true);
    assert.strictEqual(isAccepted(registry, q('2.0.0', 'D', { now: at('2026-03-11T00:00:00Z') })), false);
  });

  it('accepts the rollout version only for orgs in the rollout', () => {
    assert.strictEqual(isAccepted(registry, q('2.2.0', 'E', { org: 'org-a' })), true);
    assert.strictEqual(isAccepted(registry, q('2.2.0', 'E', { org: 'org-b' })), false);
    assert.strictEqual(isAccepted(registry, q('2.2.0', 'E')), false);
  });

  it('rejects removed and unknown majors', () => {
    assert.strictEqual(isAccepted(registry, {
      id: 'sample', major: 1, ...pin('1.4.0', 'B'), now: at('2026-06-01T00:00:00Z'),
    }), false);
    assert.strictEqual(isAccepted(registry, { id: 'nope', major: 1, ...pin('1.0.0') }), false);
  });

  it('defaults now to the current time', () => {
    assert.strictEqual(isAccepted(registry, { id: 'sample', major: 2, ...pin('2.1.0', 'C') }), true);
  });
});
