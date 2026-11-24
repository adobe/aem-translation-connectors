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
import { connectorError, isErrorResult } from '../src/index.js';

describe('errors', () => {
  it('builds an error result', () => {
    assert.deepStrictEqual(
      connectorError('auth-failed', 'bad key'),
      { error: { code: 'auth-failed', message: 'bad key' } },
    );
  });

  it('adds retryAfter when given', () => {
    assert.deepStrictEqual(
      connectorError('rate-limited', 'slow down', { retryAfter: 30 }),
      { error: { code: 'rate-limited', message: 'slow down', retryAfter: 30 } },
    );
  });

  it('rejects unknown codes', () => {
    assert.throws(() => connectorError('oops', 'x'), TypeError);
  });

  it('rejects host-only codes', () => {
    assert.throws(() => connectorError('timeout', 'x'), TypeError);
  });

  it('detects error results', () => {
    assert.strictEqual(isErrorResult({ error: { code: 'timeout', message: 'x' } }), true);
    assert.strictEqual(isErrorResult({ error: { code: 'oops', message: 'x' } }), false);
    assert.strictEqual(isErrorResult({ error: null }), false);
    assert.strictEqual(isErrorResult({ state: {} }), false);
    assert.strictEqual(isErrorResult(null), false);
  });
});
