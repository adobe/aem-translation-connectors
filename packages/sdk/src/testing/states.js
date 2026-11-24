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

import {
  mkdir, readdir, readFile, writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const toPath = (dir) => (dir instanceof URL ? fileURLToPath(dir) : dir);

/**
 * Reads the `state` fixtures that earlier releases saved, one `<version>.json` per release.
 * A missing folder means no fixtures yet.
 * @param {string|URL} dir
 * @returns {Promise<object[]>} Each is
 *   `{ version, ids, targets, calls: [{ method, input, interactions }] }`.
 */
export async function loadStateFixtures(dir) {
  const path = toPath(dir);
  let names;
  try {
    names = await readdir(path);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
  const files = names.filter((name) => name.endsWith('.json')).sort();
  return Promise.all(files.map(async (name) => JSON.parse(await readFile(join(path, name), 'utf-8'))));
}

/**
 * Writes the `state` fixture for one release as `<version>.json`.
 * @param {string|URL} dir
 * @param {{ version: string }} fixture
 */
export async function saveStateFixture(dir, fixture) {
  const path = toPath(dir);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, `${fixture.version}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
}
