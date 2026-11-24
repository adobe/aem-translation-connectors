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

import { stageOf } from './lifecycle.js';

function majorOf(registry, id, major) {
  const connector = registry.connectors?.[id];
  const entry = connector?.majors?.[String(major)];
  return entry ? { connector, entry } : null;
}

/**
 * Picks the connector version a site gets for `id` and `major`.
 * An org in the staged `rollout` gets the rollout version.
 * @param {object} registry
 * @param {{ id: string, major: number|string, org?: string, now?: Date }} query
 * @returns {null|{ id: string, major: number, version: string, integrity: string,
 *   manifest: object, stage: string, canSubmit: boolean }} `null` when the connector or
 *   major is unknown or removed.
 */
export function resolveConnector(registry, {
  id, major, org, now = new Date(),
}) {
  const found = majorOf(registry, id, major);
  if (!found) {
    return null;
  }
  const { connector, entry } = found;
  const stage = stageOf(entry, now);
  if (stage === 'removed') {
    return null;
  }
  const pick = org && entry.rollout?.orgs.includes(org) ? entry.rollout : entry;
  return {
    id,
    major: Number(major),
    version: pick.version,
    integrity: pick.integrity,
    manifest: connector.manifests[pick.version],
    stage,
    canSubmit: stage === 'active' || stage === 'deprecated',
  };
}

/**
 * Checks whether the host should accept a connector version that a client loaded.
 * It accepts the current version, the rollout version for orgs in the rollout, and the
 * previous version until its `until` time.
 * @param {object} registry
 * @param {{ id: string, major: number|string, version: string, integrity: string,
 *   org?: string, now?: Date }} query
 * @returns {boolean}
 */
export function isAccepted(registry, {
  id, major, version, integrity, org, now = new Date(),
}) {
  const found = majorOf(registry, id, major);
  if (!found || stageOf(found.entry, now) === 'removed') {
    return false;
  }
  const { entry } = found;
  const matches = (v) => v?.version === version && v.integrity === integrity;
  return matches(entry)
    || (Boolean(org) && entry.rollout?.orgs.includes(org) && matches(entry.rollout))
    || (matches(entry.previous) && now.getTime() < Date.parse(entry.previous.until));
}
