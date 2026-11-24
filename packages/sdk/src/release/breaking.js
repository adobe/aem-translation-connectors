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

import { DEFAULT_KINDS } from '../contract.js';

const added = (before = [], after = []) => after.filter((x) => !before.includes(x));

const requiredNames = (fields = []) => fields.filter((f) => f.required).map((f) => f.name);

/**
 * Lists the manifest changes that need a new major version.
 * - A new `egressHosts` or `signedUrlHosts` host.
 * - A new required credential field, or a credential field that becomes required.
 * - A new required option.
 * - A changed `auth.profile`.
 * - A removed `kind`.
 * @param {object} before The manifest of the last release in the major.
 * @param {object} after The new manifest.
 * @returns {string[]}
 */
export function breakingChanges(before, after) {
  const reasons = [];
  ['egressHosts', 'signedUrlHosts'].forEach((field) => {
    added(before[field], after[field])
      .forEach((host) => reasons.push(`adds ${field} host ${host}`));
  });
  added(requiredNames(before.credentials), requiredNames(after.credentials))
    .forEach((name) => reasons.push(`adds required credential ${name}`));
  added(before.options?.required, after.options?.required)
    .forEach((name) => reasons.push(`adds required option ${name}`));
  if (before.auth?.profile !== after.auth?.profile) {
    reasons.push(`changes auth.profile from ${before.auth?.profile} to ${after.auth?.profile}`);
  }
  const kinds = (m) => m.capabilities?.kinds ?? DEFAULT_KINDS;
  added(kinds(after), kinds(before))
    .forEach((kind) => reasons.push(`removes kind ${kind}`));
  return reasons;
}
