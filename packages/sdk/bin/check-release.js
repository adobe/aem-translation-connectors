#!/usr/bin/env node
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

import { checkRelease } from '../src/release/index.js';

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const base = at >= 0 ? args[at + 1] : 'origin/main';
const root = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--base') ?? process.cwd();

try {
  const results = await checkRelease({ root, base });
  results.forEach(({ id, reasons, ok }) => {
    const out = ok ? process.stdout : process.stderr;
    out.write(`${id}: ${ok ? 'new major (breaking commit found)' : 'needs a new major'}\n`);
    reasons.forEach((reason) => out.write(`  - ${reason}\n`));
  });
  if (results.some(({ ok }) => !ok)) {
    process.stderr.write('Mark the change as breaking: "feat(<id>)!: ..." or a "BREAKING CHANGE:" footer.\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`no connector needs an unmarked new major since ${base}\n`);
  }
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
}
