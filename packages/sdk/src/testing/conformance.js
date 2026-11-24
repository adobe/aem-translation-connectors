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

import { AssertionError } from 'node:assert';
import { LIMITS } from '../contract.js';
import { isErrorResult } from '../errors.js';
import { validateManifest } from '../manifest.js';
import {
  checkCancel, checkErrorResult, checkFetch, checkLanguages, checkModule, checkReconcile,
  checkStatus, checkSubmit, checkSubmitInput,
} from './checks.js';
import { createFakeHost } from './fake-host.js';
import { scanFile } from './static-scan.js';

function assertNone(errors) {
  if (errors.length) {
    throw new AssertionError({ message: errors.join('\n') });
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AssertionError({ message: `${label} took over ${ms} ms` })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const roundTrip = (value) => JSON.parse(JSON.stringify(value));

/**
 * Registers the conformance suite for a connector with mocha's `describe` and `it`.
 *
 * The happy path runs submit, status, and fetch in order. Each step gets the previous
 * step's `state` after a JSON round trip, as the host would store it.
 *
 * @param {object} opts
 * @param {object} opts.connector The connector module's default export.
 * @param {object} opts.manifest The connector manifest.
 * @param {string|URL} [opts.entry] The file to scan for banned globals.
 * @param {boolean} [opts.allowImports] Set when `entry` is unbundled source.
 * @param {object} [opts.options] Site options for every call.
 * @param {object} opts.scenarios Inputs and recorded interactions for each method:
 *   `languages`, `submit`, `status`, `fetch`, and `cancel` and `reconcile` when the
 *   connector has them. `errors` is a list of `{ name, method, input?, interactions, code }`.
 * @param {number} [opts.timeoutMs] Time limit for each call. Defaults to the worker limit, 15 s.
 * @param {Function} [opts.describe]
 * @param {Function} [opts.it]
 */
export function conformance({
  connector,
  manifest,
  entry,
  allowImports = false,
  options = {},
  scenarios = {},
  timeoutMs = LIMITS.workerTimeoutMs,
  describe = globalThis.describe,
  it = globalThis.it,
}) {
  async function call(method, input, { interactions = [], assets } = {}, { strict = true } = {}) {
    const fake = createFakeHost({ manifest, interactions, assets });
    const hostErrors = [];
    const host = {
      async message(msg) {
        const result = await fake.host.message(msg);
        if (isErrorResult(result)) {
          hostErrors.push(result.error.code);
        }
        return result;
      },
    };
    const result = await withTimeout(
      connector[method]({ options, ...structuredClone(input) }, host),
      timeoutMs,
      method,
    );
    const errors = [];
    const unused = fake.pending();
    if (unused.length) {
      errors.push(`${method}: ${unused.length} recorded interactions were not used`);
    }
    if (strict && hostErrors.includes('payload-too-large')) {
      errors.push(`${method}: sent an egress body over 10 MB`);
    }
    return { result, errors };
  }

  function scenario(name) {
    const s = scenarios[name];
    if (!s) {
      throw new AssertionError({ message: `scenario "${name}" is missing` });
    }
    return s;
  }

  const flow = {};

  describe(`${manifest.id ?? 'connector'} conformance`, () => {
    describe('module', () => {
      it('has a valid manifest', () => {
        assertNone(validateManifest(structuredClone(manifest)).errors);
      });

      it('exports the contract methods', () => {
        assertNone(checkModule(connector, manifest));
      });

      if (entry) {
        it('uses no banned globals', async () => {
          assertNone(await scanFile(entry, { allowImports }));
        });
      }
    });

    describe('methods', () => {
      it('languages', async () => {
        const { result, errors } = await call('languages', {}, scenario('languages'));
        assertNone([...errors, ...checkLanguages(result)]);
      });

      it('submit', async () => {
        const s = scenario('submit');
        assertNone(checkSubmitInput(s.input, manifest));
        const { result, errors } = await call('submit', s.input, s);
        assertNone([...errors, ...checkSubmit(result, s.input)]);
        flow.items = s.input.items;
        flow.targets = s.input.targets;
        flow.state = roundTrip(result.state);
      });

      it('status', async () => {
        if (!flow.state) {
          throw new AssertionError({ message: 'needs a passing submit' });
        }
        const { result, errors } = await call('status', { state: flow.state }, scenario('status'));
        assertNone([...errors, ...checkStatus(result, {
          ids: flow.items.map(({ id }) => id), targets: flow.targets, items: flow.items,
        })]);
        flow.state = roundTrip(result.state);
      });

      it('fetch', async () => {
        if (!flow.state) {
          throw new AssertionError({ message: 'needs a passing submit' });
        }
        const s = scenario('fetch');
        const ids = s.ids ?? flow.items.filter(({ kind }) => kind !== 'external').map(({ id }) => id);
        const input = { state: flow.state, lang: s.lang ?? flow.targets[0], ids };
        const { result, errors } = await call('fetch', input, s);
        assertNone([...errors, ...checkFetch(result, { ...input, items: flow.items })]);
        flow.state = roundTrip(result.state);
      });

      if (manifest.capabilities?.cancel) {
        it('cancel', async () => {
          if (!flow.state) {
            throw new AssertionError({ message: 'needs a passing submit' });
          }
          const s = scenario('cancel');
          const { result, errors } = await call('cancel', { state: flow.state, lang: s.lang }, s);
          assertNone([...errors, ...checkCancel(result)]);
        });
      }

      if (typeof connector.reconcile === 'function') {
        it('reconcile', async () => {
          const s = scenario('reconcile');
          const input = { submissionKey: s.submissionKey ?? scenarios.submit?.input.submissionKey };
          const { result, errors } = await call('reconcile', input, s);
          assertNone([...errors, ...checkReconcile(result)]);
        });
      }
    });

    describe('errors', () => {
      (scenarios.errors ?? []).forEach((s) => {
        it(`${s.method}: ${s.name ?? s.code}`, async () => {
          const { result, errors } = await call(s.method, s.input ?? {}, s, { strict: false });
          assertNone([...errors, ...checkErrorResult(result, s.code)]);
        });
      });
    });
  });
}
