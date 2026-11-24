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

import { isDeepStrictEqual } from 'node:util';
import {
  DEFAULT_KINDS, ITEM_STATUSES, LIMITS, OPTIONAL_METHODS, REQUIRED_METHODS,
} from '../contract.js';
import { ERROR_CODES, isErrorResult } from '../errors.js';

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v) => typeof v === 'string' && v.length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every(isString);

/**
 * @param {object} connector The module's default export.
 * @param {object} manifest
 * @returns {string[]}
 */
export function checkModule(connector, manifest) {
  if (!isObject(connector)) {
    return ['the default export must be an object'];
  }
  const errors = [];
  REQUIRED_METHODS
    .filter((name) => typeof connector[name] !== 'function')
    .forEach((name) => errors.push(`${name} must be a function`));
  OPTIONAL_METHODS
    .filter((name) => name in connector && typeof connector[name] !== 'function')
    .forEach((name) => errors.push(`${name} must be a function when present`));
  const hasCancel = typeof connector.cancel === 'function';
  if (manifest.capabilities?.cancel !== hasCancel) {
    errors.push(`capabilities.cancel is ${manifest.capabilities?.cancel} but cancel is ${hasCancel ? '' : 'not '}defined`);
  }
  return errors;
}

/**
 * @param {unknown} state
 * @param {object[]} [items] Submitted items. Their content must not end up in `state`.
 * @returns {string[]}
 */
export function checkState(state, items = []) {
  if (!isObject(state)) {
    return ['state must be an object'];
  }
  let json;
  try {
    json = JSON.stringify(state);
  } catch (e) {
    return [`state must be JSON: ${e.message}`];
  }
  const errors = [];
  if (!isDeepStrictEqual(JSON.parse(json), state)) {
    errors.push('state must survive a JSON round trip unchanged');
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > LIMITS.stateBytes) {
    errors.push(`state is ${bytes} bytes, over the ${LIMITS.stateBytes} byte cap`);
  }
  items
    .filter(({ html }) => typeof html === 'string' && html.length >= 32 && json.includes(html))
    .forEach(({ id }) => errors.push(`state contains the content of item ${id}`));
  return errors;
}

/**
 * @param {unknown} result
 * @param {string} [expectedCode]
 * @returns {string[]}
 */
export function checkErrorResult(result, expectedCode) {
  if (!isObject(result) || !isObject(result.error)) {
    return ['expected an error result'];
  }
  const { code, message, retryAfter } = result.error;
  const errors = [];
  if (!ERROR_CODES.includes(code)) {
    errors.push(`unknown error code: ${code}`);
  }
  if (typeof message !== 'string') {
    errors.push('error.message must be a string');
  }
  if (retryAfter !== undefined && !(Number.isFinite(retryAfter) && retryAfter >= 0)) {
    errors.push('error.retryAfter must be a number of seconds');
  }
  if (expectedCode && code !== expectedCode) {
    errors.push(`expected error code ${expectedCode}, got ${code}`);
  }
  return errors;
}

function unexpectedError(result) {
  return isErrorResult(result) ? [`unexpected error: ${result.error.code}: ${result.error.message}`] : [];
}

export function checkLanguages(result) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  if (!isObject(result)) {
    return ['result must be an object'];
  }
  if (result.pairs === 'any') {
    return [];
  }
  if (!Array.isArray(result.pairs)) {
    return ['pairs must be an array or "any"'];
  }
  return result.pairs.flatMap((pair, i) => (isObject(pair) && isString(pair.source)
    && isStringArray(pair.targets) && pair.targets.length
    ? []
    : [`pairs[${i}] must be { source, targets: [lang] }`]));
}

/**
 * Checks a submit input against the manifest, so scenarios stay realistic.
 * @param {object} input
 * @param {object} manifest
 * @returns {string[]}
 */
export function checkSubmitInput(input, manifest) {
  const {
    maxBatchItems, maxBatchBytes, kinds = DEFAULT_KINDS, maxAssetBytes,
  } = manifest.capabilities;
  const errors = [];
  if (input.items.length > maxBatchItems) {
    errors.push(`scenario has ${input.items.length} items, over maxBatchItems ${maxBatchItems}`);
  }
  const bytes = input.items
    .reduce((sum, { html = '' }) => sum + new TextEncoder().encode(html).length, 0);
  if (bytes > maxBatchBytes) {
    errors.push(`scenario has ${bytes} bytes of html, over maxBatchBytes ${maxBatchBytes}`);
  }
  input.items
    .filter(({ kind }) => !kinds.includes(kind))
    .forEach(({ id, kind }) => errors.push(`item ${id} has kind ${kind}, which the manifest does not declare`));
  input.items
    .filter(({ kind, size }) => kind === 'asset' && size > maxAssetBytes)
    .forEach(({ id }) => errors.push(`item ${id} is over maxAssetBytes`));
  return errors;
}

export function checkSubmit(result, input) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  if (!isObject(result)) {
    return ['result must be an object'];
  }
  const errors = checkState(result.state, input.items);
  if (!Array.isArray(result.jobs) || !result.jobs.length) {
    return [...errors, 'jobs must be a non-empty array'];
  }
  result.jobs.forEach((job, i) => {
    if (!isObject(job) || !isString(job.id) || !isStringArray(job.targets)) {
      errors.push(`jobs[${i}] must be { id, targets: [lang] }`);
    } else {
      job.targets
        .filter((lang) => !input.targets.includes(lang))
        .forEach((lang) => errors.push(`jobs[${i}] has target ${lang}, which was not requested`));
    }
  });
  const covered = new Set(result.jobs.flatMap((job) => job?.targets ?? []));
  input.targets
    .filter((lang) => !covered.has(lang))
    .forEach((lang) => errors.push(`no job covers target ${lang}`));
  return errors;
}

export function checkStatus(result, { ids, targets, items = [] }) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  if (!isObject(result)) {
    return ['result must be an object'];
  }
  const errors = checkState(result.state, items);
  if (!Array.isArray(result.items)) {
    return [...errors, 'items must be an array'];
  }
  result.items.forEach((item, i) => {
    if (!isObject(item)) {
      errors.push(`items[${i}] must be an object`);
      return;
    }
    if (!ids.includes(item.id)) {
      errors.push(`items[${i}] has unknown id ${item.id}`);
    }
    if (!targets.includes(item.lang)) {
      errors.push(`items[${i}] has unknown lang ${item.lang}`);
    }
    if (!ITEM_STATUSES.includes(item.status)) {
      errors.push(`items[${i}] has unknown status ${item.status}`);
    }
  });
  if (result.progress !== undefined
    && !(Number.isFinite(result.progress) && result.progress >= 0 && result.progress <= 100)) {
    errors.push('progress must be a number from 0 to 100');
  }
  return errors;
}

export function checkFetch(result, { lang, ids, items = [] }) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  if (!isObject(result)) {
    return ['result must be an object'];
  }
  const errors = checkState(result.state, items);
  if (!Array.isArray(result.items)) {
    return [...errors, 'items must be an array'];
  }
  result.items.forEach((item, i) => {
    if (!isObject(item)) {
      errors.push(`items[${i}] must be an object`);
      return;
    }
    if (!ids.includes(item.id)) {
      errors.push(`items[${i}] has id ${item.id}, which was not requested`);
    }
    if (item.lang !== lang) {
      errors.push(`items[${i}] has lang ${item.lang}, expected ${lang}`);
    }
    const isHtml = typeof item.html === 'string';
    const isUrl = isString(item.url) && isString(item.contentType);
    if (isHtml === isUrl) {
      errors.push(`items[${i}] must have either html, or url and contentType`);
    }
  });
  return errors;
}

export function checkReconcile(result) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  if (isObject(result) && result.notFound === true) {
    return [];
  }
  return isObject(result) ? checkState(result.state) : ['result must be an object'];
}

export function checkCancel(result) {
  const failed = unexpectedError(result);
  if (failed.length) {
    return failed;
  }
  return isObject(result) ? checkState(result.state) : ['result must be an object'];
}
