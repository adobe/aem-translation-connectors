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

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { validateManifest } from '../manifest.js';
import { scanSource } from '../testing/static-scan.js';

export const SOURCE_ENTRY = 'src/connector.js';

/**
 * @param {Uint8Array|string} bytes
 * @returns {string} A subresource integrity value, `sha384-<base64>`.
 */
export function integrityOf(bytes) {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf-8'));
}

/**
 * Bundles a connector into one self-contained ES module and writes the built manifest.
 *
 * Reads `connector.json` and `package.json` in `dir`, bundles `src/connector.js`, and
 * writes `dist/<entry>` and `dist/connector.json`. The built manifest gets `version` from
 * `package.json` and `integrity` from the bundle.
 *
 * @param {object} opts
 * @param {string} opts.dir The connector folder.
 * @returns {Promise<{ manifest: object, bundle: string }>} The built manifest and bundle path.
 */
export async function buildConnector({ dir }) {
  const source = await readJson(join(dir, 'connector.json'));
  const { version } = await readJson(join(dir, 'package.json'));
  const problems = [];
  ['version', 'integrity']
    .filter((key) => key in source)
    .forEach((key) => problems.push(`connector.json: remove ${key}; the build sets it`));
  problems.push(...validateManifest(structuredClone(source)).errors.map((e) => `connector.json: ${e}`));
  if (problems.length) {
    throw new Error(problems.join('\n'));
  }

  const result = await build({
    entryPoints: [join(dir, SOURCE_ENTRY)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2022',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  const code = output.text;

  const scan = scanSource(code);
  if (scan.length) {
    throw new Error(`bundle uses banned features:\n${scan.join('\n')}`);
  }

  const {
    id, name, contract, entry, ...rest
  } = source;
  const manifest = {
    id, version, name, contract, entry, integrity: integrityOf(output.contents), ...rest,
  };
  const built = validateManifest(structuredClone(manifest), { built: true });
  if (!built.valid) {
    throw new Error(`built manifest: ${built.errors.join('\n')}`);
  }

  const dist = join(dir, 'dist');
  const bundle = join(dist, entry);
  await mkdir(dist, { recursive: true });
  await writeFile(bundle, output.contents);
  await writeFile(join(dist, 'connector.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bundle };
}
