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
import { lifecycleDates, stageOf } from '../src/index.js';

describe('lifecycle', () => {
  it('retires 60 days after deprecation and removes 30 days after that', () => {
    assert.deepStrictEqual(lifecycleDates('2026-01-01T00:00:00Z'), {
      deprecatedAt: '2026-01-01T00:00:00.000Z',
      retiredAt: '2026-03-02T00:00:00.000Z',
      removedAt: '2026-04-01T00:00:00.000Z',
    });
  });

  it('computes the stage from the dates', () => {
    const major = lifecycleDates('2026-01-01T00:00:00Z');
    assert.strictEqual(stageOf({}, new Date()), 'active');
    assert.strictEqual(stageOf(major, new Date('2025-12-31T23:59:59Z')), 'active');
    assert.strictEqual(stageOf(major, new Date('2026-01-01T00:00:00Z')), 'deprecated');
    assert.strictEqual(stageOf(major, new Date('2026-03-02T00:00:00Z')), 'retired');
    assert.strictEqual(stageOf(major, new Date('2026-04-01T00:00:00Z')), 'removed');
  });

  it('defaults now to the current time', () => {
    assert.strictEqual(stageOf(lifecycleDates('2000-01-01T00:00:00Z')), 'removed');
  });
});
