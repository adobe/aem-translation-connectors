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

const DAY_MS = 24 * 60 * 60 * 1000;

export const PREVIOUS_WINDOW_MS = DAY_MS;
export const RETIRE_AFTER_DAYS = 60;
export const REMOVE_AFTER_DAYS = 30;
export const MAX_LIVE_MAJORS = 2;

/**
 * The lifecycle dates for a major that is deprecated at `deprecatedAt`.
 * @param {string|Date} deprecatedAt
 * @returns {{ deprecatedAt: string, retiredAt: string, removedAt: string }}
 */
export function lifecycleDates(deprecatedAt) {
  const start = new Date(deprecatedAt).getTime();
  const retired = start + RETIRE_AFTER_DAYS * DAY_MS;
  return {
    deprecatedAt: new Date(start).toISOString(),
    retiredAt: new Date(retired).toISOString(),
    removedAt: new Date(retired + REMOVE_AFTER_DAYS * DAY_MS).toISOString(),
  };
}

/**
 * The stage of a major at `now`.
 * - `active`: no deprecation yet.
 * - `deprecated`: still accepts submissions; admins and users see a warning.
 * - `retired`: no new submissions; open jobs can still finish.
 * - `removed`: gone.
 * @param {{ deprecatedAt?: string, retiredAt?: string, removedAt?: string }} major
 * @param {Date} [now]
 * @returns {'active'|'deprecated'|'retired'|'removed'}
 */
export function stageOf(major, now = new Date()) {
  const t = now.getTime();
  if (major.removedAt && t >= Date.parse(major.removedAt)) {
    return 'removed';
  }
  if (major.retiredAt && t >= Date.parse(major.retiredAt)) {
    return 'retired';
  }
  if (major.deprecatedAt && t >= Date.parse(major.deprecatedAt)) {
    return 'deprecated';
  }
  return 'active';
}
