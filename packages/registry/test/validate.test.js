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
import { validateRegistry } from '../src/validate.js';
import { makeRegistry, manifestFor, pin } from './helpers.js';

const now = new Date('2026-03-20T00:00:00Z');

function setup() {
  const registry = makeRegistry();
  return { registry, c: registry.connectors.sample };
}

const errorsOf = (registry) => validateRegistry(registry, { now }).errors;

describe('validateRegistry', () => {
  it('accepts the shipped registry.json', async () => {
    const registry = JSON.parse(await readFile(new URL('../registry.json', import.meta.url), 'utf-8'));
    assert.deepStrictEqual(validateRegistry(registry), { valid: true, errors: [] });
  });

  it('accepts a full registry', () => {
    assert.deepStrictEqual(validateRegistry(makeRegistry(), { now }), { valid: true, errors: [] });
  });

  it('reports schema errors', () => {
    const { valid, errors } = validateRegistry({ connectors: { Bad: {} } });
    assert.strictEqual(valid, false);
    assert.ok(errors.length > 0);
    assert.deepStrictEqual(validateRegistry({}).errors, ["/ must have required property 'connectors'"]);
  });

  it('requires all lifecycle dates together', () => {
    const { registry, c } = setup();
    delete c.majors[1].removedAt;
    assert.ok(errorsOf(registry).length > 0);
  });

  it('reports dates that do not parse', () => {
    const { registry, c } = setup();
    c.majors[2].releasedAt = 'soon';
    c.majors[2].previous.until = 'later';
    assert.deepStrictEqual(errorsOf(registry), ['sample@2.releasedAt is not a date', 'sample@2.previous.until is not a date']);
  });

  it('limits the previous window to 24 h', () => {
    const { registry, c } = setup();
    c.majors[2].previous.until = '2026-03-12T00:00:00Z';
    assert.deepStrictEqual(errorsOf(registry), [
      'sample@2.previous.until is more than 24 h after releasedAt',
    ]);
  });

  it('checks the gaps between lifecycle dates', () => {
    const { registry, c } = setup();
    c.majors[1].retiredAt = '2026-04-01T00:00:00Z';
    c.majors[1].removedAt = '2026-04-02T00:00:00Z';
    assert.deepStrictEqual(errorsOf(registry), [
      'sample@1.retiredAt is less than 60 days after deprecatedAt',
      'sample@1.removedAt is less than 30 days after retiredAt',
    ]);
  });

  it('checks pinned versions against their major and manifest', () => {
    const { registry, c } = setup();
    c.majors[2].rollout = { ...pin('3.0.0', 'E'), orgs: ['org-a'] };
    c.majors[2].previous.integrity = pin('', 'F').integrity;
    delete c.manifests['2.2.0'];
    assert.deepStrictEqual(errorsOf(registry), [
      'sample@2.previous does not match the id, version, and integrity of its manifest',
      'sample@2.rollout version 3.0.0 is not in major 2',
      'sample@2.rollout version 3.0.0 has no manifest',
    ]);
  });

  it('allows only one major that is not deprecated', () => {
    const { registry, c } = setup();
    ['deprecatedAt', 'retiredAt', 'removedAt'].forEach((k) => delete c.majors[1][k]);
    assert.deepStrictEqual(errorsOf(registry), ['sample has more than one major that is not deprecated']);
  });

  it('allows at most two live majors', () => {
    const { registry, c } = setup();
    c.majors[3] = { ...pin('3.0.0', 'G'), releasedAt: '2026-03-15T00:00:00Z' };
    Object.assign(c.majors[2], {
      deprecatedAt: '2026-03-15T00:00:00Z', retiredAt: '2026-05-14T00:00:00Z', removedAt: '2026-06-13T00:00:00Z',
    });
    c.majors[1].removedAt = '2026-06-30T00:00:00Z';
    c.manifests['3.0.0'] = manifestFor('sample', '3.0.0', 'G');
    assert.deepStrictEqual(errorsOf(registry), ['sample has more than 2 live majors']);
  });

  it('reports unused and invalid manifests', () => {
    const { registry, c } = setup();
    c.manifests['9.9.9'] = manifestFor('sample', '9.9.9');
    c.manifests['2.1.0'].contract = 2;
    assert.deepStrictEqual(errorsOf(registry), [
      'sample manifest 2.1.0: /contract must be equal to constant',
      'sample manifest 9.9.9 is not used by any major',
    ]);
  });
});
