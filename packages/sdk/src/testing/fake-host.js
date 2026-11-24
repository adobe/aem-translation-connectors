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

import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { HOST_MESSAGE_TYPES, LIMITS } from '../contract.js';
import { HOST_ERROR_CODES } from '../errors.js';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];

export class HostPolicyError extends Error {}

/**
 * Checks a hostname against manifest host patterns. `*.example.com` matches any subdomain
 * of example.com, but not example.com itself.
 * @param {string} hostname
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function hostMatches(hostname, patterns = []) {
  return patterns.some((pattern) => (pattern.startsWith('*.')
    ? hostname.endsWith(pattern.slice(1))
    : hostname === pattern));
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function bodiesMatch(expected, actual) {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected !== 'string') {
    const parsed = parseJson(actual ?? '');
    return parsed.ok && isDeepStrictEqual(expected, parsed.value);
  }
  return expected === actual;
}

function lowercaseKeys(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

function checkUrl(url, patterns, field) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HostPolicyError(`invalid url: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new HostPolicyError(`only https is allowed: ${url}`);
  }
  if (!hostMatches(parsed.hostname, patterns)) {
    throw new HostPolicyError(`${parsed.hostname} is not in ${field}`);
  }
}

/**
 * Creates a fake host for connector tests. It replays recorded vendor responses and
 * enforces the same rules as the real host.
 *
 * An interaction is `{ type?, request: { method?, url, body? }, response }`.
 * - `type` is `egress` (default) or `upload`.
 * - `request.body` is optional. A string must match exactly. Any other JSON value matches a
 *   JSON request body with the same content.
 * - `response` is `{ status, headers?, body?, bodyEncoding? }`, or `{ error: { code } }` to
 *   simulate a host error such as `timeout`.
 *
 * Each interaction answers one call, in order. Polling can therefore return a different
 * response each time.
 *
 * @param {object} opts
 * @param {object} opts.manifest The connector manifest.
 * @param {object[]} [opts.interactions]
 * @param {Record<string, Uint8Array>} [opts.assets] Asset bytes by item id, for uploads.
 */
export function createFakeHost({ manifest, interactions = [], assets = {} }) {
  const queue = interactions.map((interaction) => ({ interaction, used: false }));
  const calls = [];
  const logs = [];

  function replay(type, method, url, body) {
    const entry = queue.find(({ interaction: { type: t = 'egress', request }, used }) => !used
      && t === type
      && (request.method ?? 'GET').toUpperCase() === method
      && request.url === url
      && bodiesMatch(request.body, body));
    if (!entry) {
      throw new Error(`fake host: no recorded ${type} response for ${method} ${url}`);
    }
    entry.used = true;
    const { response } = entry.interaction;
    if (response.error) {
      if (!HOST_ERROR_CODES.includes(response.error.code)) {
        throw new Error(`fake host: ${response.error.code} is not a host error code`);
      }
      return { error: { message: response.error.code, ...response.error } };
    }
    const result = {
      status: response.status,
      headers: lowercaseKeys(response.headers),
      body: response.body ?? '',
    };
    if (response.bodyEncoding) {
      result.bodyEncoding = response.bodyEncoding;
    }
    return result;
  }

  async function message(msg) {
    if (!msg || !HOST_MESSAGE_TYPES.includes(msg.type)) {
      throw new TypeError(`unknown host message type: ${msg?.type}`);
    }
    calls.push(structuredClone(msg));

    if (msg.type === 'log') {
      if (!LOG_LEVELS.includes(msg.level)) {
        throw new TypeError(`unknown log level: ${msg.level}`);
      }
      logs.push({ level: msg.level, message: msg.message });
      return undefined;
    }

    const method = (msg.method ?? (msg.type === 'upload' ? 'PUT' : 'GET')).toUpperCase();

    if (msg.type === 'upload') {
      if (!(msg.itemId in assets)) {
        throw new HostPolicyError(`unknown asset item: ${msg.itemId}`);
      }
      checkUrl(msg.url, manifest.signedUrlHosts, 'signedUrlHosts');
      return replay('upload', method, msg.url);
    }

    checkUrl(msg.url, manifest.egressHosts, 'egressHosts');
    if (msg.bodyEncoding !== undefined && msg.bodyEncoding !== 'base64') {
      throw new TypeError(`unknown body encoding: ${msg.bodyEncoding}`);
    }
    if (Buffer.byteLength(msg.body ?? '') > LIMITS.egressBodyBytes) {
      return { error: { code: 'payload-too-large', message: 'egress body is over 10 MB' } };
    }
    return replay('egress', method, msg.url, msg.body);
  }

  return {
    host: { message },
    calls,
    logs,
    pending: () => queue.filter(({ used }) => !used).map(({ interaction }) => interaction),
  };
}

/**
 * Reads recorded interactions from a JSON fixture file: `{ "interactions": [...] }`.
 * @param {string|URL} file
 * @returns {Promise<object[]>}
 */
export async function loadInteractions(file) {
  const { interactions } = JSON.parse(await readFile(file, 'utf-8'));
  if (!Array.isArray(interactions)) {
    throw new TypeError(`${file}: interactions must be an array`);
  }
  return interactions;
}
