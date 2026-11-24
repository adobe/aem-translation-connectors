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

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { breakingChanges } from './breaking.js';

const BREAKING = /^[a-z]+(\([^)]*\))?!:|^BREAKING[ -]CHANGE:/m;

/**
 * Runs git in `cwd` and returns its stdout.
 * @param {string} cwd
 * @returns {(args: string[]) => Promise<string>}
 */
export function gitRunner(cwd) {
  const run = promisify(execFile);
  return async (args) => (await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout;
}

/**
 * @param {string} message A commit message.
 * @returns {boolean} Whether it marks a breaking change, with `type!:` or a
 *   `BREAKING CHANGE:` footer.
 */
export function isBreakingCommit(message) {
  return BREAKING.test(message);
}

async function baseManifest(git, base, path) {
  try {
    return JSON.parse(await git(['show', `${base}:${path}`]));
  } catch {
    return null;
  }
}

/**
 * Compares each connector's `connector.json` with `base`. A connector with changes that need
 * a new major fails, unless a commit since `base` that touches it marks a breaking change.
 * @param {object} opts
 * @param {string} opts.root The repository root.
 * @param {string} opts.base The git ref to compare with, e.g. `origin/main`.
 * @param {(args: string[]) => Promise<string>} [opts.git]
 * @returns {Promise<{ id: string, reasons: string[], ok: boolean }[]>} One entry per
 *   connector with breaking changes.
 */
export async function checkRelease({ root, base, git = gitRunner(root) }) {
  const dirs = await readdir(join(root, 'connectors'), { withFileTypes: true });
  const results = [];
  await Promise.all(dirs.filter((d) => d.isDirectory()).map(async ({ name }) => {
    const path = `connectors/${name}/connector.json`;
    let current;
    try {
      current = JSON.parse(await readFile(join(root, path), 'utf-8'));
    } catch {
      return;
    }
    const before = await baseManifest(git, base, path);
    if (!before) {
      return;
    }
    const reasons = breakingChanges(before, current);
    if (!reasons.length) {
      return;
    }
    const log = await git(['log', '--format=%B%x00', `${base}..HEAD`, '--', `connectors/${name}`]);
    const ok = log.split('\0').some(isBreakingCommit);
    results.push({ id: current.id ?? name, reasons, ok });
  }));
  return results.sort((a, b) => a.id.localeCompare(b.id));
}
