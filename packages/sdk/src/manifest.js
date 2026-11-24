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
import {
  AUTH_PROFILES, CONTRACT_VERSION, DEFAULT_KINDS, ITEM_KINDS, LIMITS,
} from './contract.js';

const HOST_PATTERN = '^(\\*\\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$';

const hostList = {
  type: 'array',
  minItems: 1,
  uniqueItems: true,
  items: { type: 'string', pattern: HOST_PATTERN },
};

const namedFields = {
  type: 'array',
  uniqueItems: true,
  items: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
      required: { type: 'boolean', default: false },
    },
  },
};

const jsonSchema = { type: 'object' };

export const MANIFEST_SCHEMA = Object.freeze({
  $id: 'https://github.com/adobe/aem-translation-connectors/connector.schema.json',
  type: 'object',
  required: ['id', 'name', 'contract', 'entry', 'egressHosts', 'credentials', 'auth',
    'options', 'capabilities'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z.-]+)?$' },
    name: { type: 'string', minLength: 1 },
    contract: { const: CONTRACT_VERSION },
    entry: { type: 'string', pattern: '^[^/][^:]*\\.js$' },
    integrity: { type: 'string', pattern: '^sha384-[A-Za-z0-9+/]{64}$' },
    egressHosts: hostList,
    signedUrlHosts: hostList,
    credentials: namedFields,
    auth: {
      type: 'object',
      required: ['profile'],
      properties: {
        profile: { enum: [...AUTH_PROFILES] },
      },
    },
    options: jsonSchema,
    capabilities: {
      type: 'object',
      required: ['cancel', 'maxBatchItems', 'maxBatchBytes', 'formats'],
      additionalProperties: false,
      properties: {
        cancel: { type: 'boolean' },
        maxBatchItems: { type: 'integer', minimum: 1 },
        maxBatchBytes: { type: 'integer', minimum: 1, maximum: LIMITS.maxBatchBytes },
        formats: {
          type: 'array', minItems: 1, uniqueItems: true, items: { const: 'html' },
        },
        kinds: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { enum: [...ITEM_KINDS] },
          default: [...DEFAULT_KINDS],
        },
        maxAssetBytes: { type: 'integer', minimum: 1 },
      },
    },
    context: namedFields,
    submitOptions: jsonSchema,
  },
});

const ajv = new Ajv({ allErrors: true, useDefaults: true });
const validateShape = ajv.compile(MANIFEST_SCHEMA);
const schemaChecker = new Ajv({ allErrors: true });

function formatErrors(errors) {
  return errors.map(({ instancePath, message }) => `${instancePath || '/'} ${message}`);
}

/**
 * Validates a connector manifest. Applies schema defaults to `manifest` in place.
 * @param {object} manifest
 * @param {{ built?: boolean }} [opts] `built` also requires `version` and `integrity`,
 *   which the build adds.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest, { built = false } = {}) {
  if (!validateShape(manifest)) {
    return { valid: false, errors: formatErrors(validateShape.errors) };
  }
  const errors = [];
  if (built) {
    ['version', 'integrity']
      .filter((key) => !manifest[key])
      .forEach((key) => errors.push(`/${key} is required in a built manifest`));
  }
  ['options', 'submitOptions']
    .filter((key) => manifest[key] && !schemaChecker.validateSchema(manifest[key]))
    .forEach((key) => errors.push(`/${key} is not a valid JSON Schema`));
  const { kinds, maxAssetBytes } = manifest.capabilities;
  if (kinds.includes('asset')) {
    if (!manifest.signedUrlHosts) {
      errors.push('/signedUrlHosts is required when capabilities.kinds includes "asset"');
    }
    if (!maxAssetBytes) {
      errors.push('/capabilities/maxAssetBytes is required when capabilities.kinds includes "asset"');
    }
  }
  return { valid: errors.length === 0, errors };
}
