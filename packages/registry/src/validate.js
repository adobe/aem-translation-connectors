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

import Ajv from 'ajv';
import { validateManifest } from '@adobe/aem-translation-connector-sdk';
import {
  MAX_LIVE_MAJORS, PREVIOUS_WINDOW_MS, REMOVE_AFTER_DAYS, RETIRE_AFTER_DAYS, stageOf,
} from './lifecycle.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const VERSION = '^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$';
const INTEGRITY = '^sha384-[A-Za-z0-9+/]{64}$';
const date = { type: 'string', minLength: 1 };
const pinned = {
  version: { type: 'string', pattern: VERSION },
  integrity: { type: 'string', pattern: INTEGRITY },
};

export const REGISTRY_SCHEMA = Object.freeze({
  type: 'object',
  required: ['connectors'],
  additionalProperties: false,
  properties: {
    connectors: {
      type: 'object',
      propertyNames: { pattern: '^[a-z0-9][a-z0-9-]*$' },
      additionalProperties: {
        type: 'object',
        required: ['majors', 'manifests'],
        additionalProperties: false,
        properties: {
          majors: {
            type: 'object',
            minProperties: 1,
            propertyNames: { pattern: '^[1-9][0-9]*$' },
            additionalProperties: {
              type: 'object',
              required: ['version', 'integrity', 'releasedAt'],
              additionalProperties: false,
              properties: {
                ...pinned,
                releasedAt: date,
                previous: {
                  type: 'object',
                  required: ['version', 'integrity', 'until'],
                  additionalProperties: false,
                  properties: { ...pinned, until: date },
                },
                rollout: {
                  type: 'object',
                  required: ['version', 'integrity', 'orgs'],
                  additionalProperties: false,
                  properties: {
                    ...pinned,
                    orgs: {
                      type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 },
                    },
                  },
                },
                deprecatedAt: date,
                retiredAt: date,
                removedAt: date,
              },
              dependencies: {
                deprecatedAt: ['retiredAt', 'removedAt'],
                retiredAt: ['deprecatedAt'],
                removedAt: ['deprecatedAt'],
              },
            },
          },
          manifests: { type: 'object', additionalProperties: { type: 'object' } },
        },
      },
    },
  },
});

const validateShape = new Ajv({ allErrors: true }).compile(REGISTRY_SCHEMA);

function checkDates(where, entry, errors) {
  ['releasedAt', 'deprecatedAt', 'retiredAt', 'removedAt']
    .filter((key) => entry[key] !== undefined && Number.isNaN(Date.parse(entry[key])))
    .forEach((key) => errors.push(`${where}.${key} is not a date`));
  if (entry.previous && Number.isNaN(Date.parse(entry.previous.until))) {
    errors.push(`${where}.previous.until is not a date`);
  }
  const window = entry.previous && Date.parse(entry.previous.until) - Date.parse(entry.releasedAt);
  if (window > PREVIOUS_WINDOW_MS) {
    errors.push(`${where}.previous.until is more than 24 h after releasedAt`);
  }
  if (entry.deprecatedAt) {
    if (Date.parse(entry.retiredAt) - Date.parse(entry.deprecatedAt) < RETIRE_AFTER_DAYS * DAY_MS) {
      errors.push(`${where}.retiredAt is less than ${RETIRE_AFTER_DAYS} days after deprecatedAt`);
    }
    if (Date.parse(entry.removedAt) - Date.parse(entry.retiredAt) < REMOVE_AFTER_DAYS * DAY_MS) {
      errors.push(`${where}.removedAt is less than ${REMOVE_AFTER_DAYS} days after retiredAt`);
    }
  }
}

function checkPinned(where, id, major, pin, manifests, errors) {
  if (pin.version.split('.')[0] !== major) {
    errors.push(`${where} version ${pin.version} is not in major ${major}`);
  }
  const manifest = manifests[pin.version];
  if (!manifest) {
    errors.push(`${where} version ${pin.version} has no manifest`);
    return;
  }
  if (manifest.id !== id || manifest.version !== pin.version
    || manifest.integrity !== pin.integrity) {
    errors.push(`${where} does not match the id, version, and integrity of its manifest`);
  }
}

/**
 * Validates registry data.
 * @param {object} registry
 * @param {{ now?: Date }} [opts] `now` decides which majors are still live.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRegistry(registry, { now = new Date() } = {}) {
  if (!validateShape(registry)) {
    return {
      valid: false,
      errors: validateShape.errors.map(({ instancePath, message }) => `${instancePath || '/'} ${message}`),
    };
  }
  const errors = [];
  Object.entries(registry.connectors).forEach(([id, { majors, manifests }]) => {
    const used = new Set();
    Object.entries(majors).forEach(([major, entry]) => {
      const where = `${id}@${major}`;
      checkDates(where, entry, errors);
      [['', entry], ['.previous', entry.previous], ['.rollout', entry.rollout]]
        .filter(([, pin]) => pin)
        .forEach(([suffix, pin]) => {
          used.add(pin.version);
          checkPinned(`${where}${suffix}`, id, major, pin, manifests, errors);
        });
    });
    const entries = Object.values(majors);
    if (entries.filter((entry) => !entry.deprecatedAt).length > 1) {
      errors.push(`${id} has more than one major that is not deprecated`);
    }
    if (entries.filter((entry) => stageOf(entry, now) !== 'removed').length > MAX_LIVE_MAJORS) {
      errors.push(`${id} has more than ${MAX_LIVE_MAJORS} live majors`);
    }
    Object.entries(manifests).forEach(([version, manifest]) => {
      if (!used.has(version)) {
        errors.push(`${id} manifest ${version} is not used by any major`);
      }
      validateManifest(structuredClone(manifest), { built: true }).errors
        .forEach((e) => errors.push(`${id} manifest ${version}: ${e}`));
    });
  });
  return { valid: errors.length === 0, errors };
}
