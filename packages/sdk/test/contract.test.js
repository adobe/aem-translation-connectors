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
  CONTRACT_VERSION, ITEM_STATUSES, LIMITS, REQUIRED_METHODS, OPTIONAL_METHODS,
} from '../src/index.js';

describe('contract', () => {
  it('is version 1', () => {
    assert.strictEqual(CONTRACT_VERSION, 1);
  });

  it('lists the item statuses', () => {
    assert.deepStrictEqual(ITEM_STATUSES, [
      'queued', 'awaiting-authorization', 'in-progress', 'ready', 'failed', 'cancelled',
    ]);
  });

  it('splits required and optional methods', () => {
    assert.deepStrictEqual(REQUIRED_METHODS, ['languages', 'submit', 'status', 'fetch']);
    assert.deepStrictEqual(OPTIONAL_METHODS, ['reconcile', 'cancel']);
  });

  it('keeps the batch cap under the encoded body cap', () => {
    assert.ok(LIMITS.maxBatchBytes * (4 / 3) <= LIMITS.egressBodyBytes);
  });

  it('freezes the constants', () => {
    assert.throws(() => ITEM_STATUSES.push('done'), TypeError);
  });
});
