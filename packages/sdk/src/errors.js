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

export const CONNECTOR_ERROR_CODES = Object.freeze([
  'auth-failed',
  'rate-limited',
  'unsupported-language',
  'invalid-content',
  'vendor-error',
  'not-found',
]);

export const HOST_ERROR_CODES = Object.freeze([
  'timeout',
  'payload-too-large',
  'vendor-sign-in-required',
]);

export const ERROR_CODES = Object.freeze([...CONNECTOR_ERROR_CODES, ...HOST_ERROR_CODES]);

/**
 * @typedef {object} ErrorResult
 * @property {{ code: string, message: string, retryAfter?: number }} error
 *   `retryAfter` is in seconds.
 */

/**
 * Builds the error result a connector returns.
 * @param {string} code One of CONNECTOR_ERROR_CODES.
 * @param {string} message
 * @param {{ retryAfter?: number }} [opts]
 * @returns {ErrorResult}
 */
export function connectorError(code, message, { retryAfter } = {}) {
  if (!CONNECTOR_ERROR_CODES.includes(code)) {
    throw new TypeError(`unknown connector error code: ${code}`);
  }
  const error = { code, message };
  if (retryAfter !== undefined) {
    error.retryAfter = retryAfter;
  }
  return { error };
}

/**
 * @param {unknown} result
 * @returns {result is ErrorResult}
 */
export function isErrorResult(result) {
  return typeof result === 'object'
    && result !== null
    && typeof result.error === 'object'
    && result.error !== null
    && ERROR_CODES.includes(result.error.code);
}
