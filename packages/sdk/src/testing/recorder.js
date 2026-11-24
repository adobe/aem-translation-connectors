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

import { writeFile } from 'node:fs/promises';
import { LIMITS } from '../contract.js';

const DROPPED_RESPONSE_HEADERS = ['set-cookie', 'authorization', 'www-authenticate'];
const TEXT_TYPES = /^(text\/|application\/([a-z.+-]*\+)?(json|xml|javascript)|application\/x-www-form-urlencoded)/;

/**
 * The env var that holds a credential in record mode, e.g. CONNECTOR_SAMPLE_APIKEY.
 * @param {string} connectorId
 * @param {string} field
 * @returns {string}
 */
export function credentialEnvName(connectorId, field) {
  const part = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `CONNECTOR_${part(connectorId)}_${part(field)}`;
}

/**
 * Reads the manifest's credentials from env vars.
 * @param {object} manifest
 * @param {Record<string, string|undefined>} env
 * @returns {Record<string, string>}
 */
export function credentialsFromEnv(manifest, env) {
  const values = {};
  const missing = [];
  manifest.credentials.forEach(({ name, required }) => {
    const key = credentialEnvName(manifest.id, name);
    if (env[key]) {
      values[name] = env[key];
    } else if (required) {
      missing.push(key);
    }
  });
  if (missing.length) {
    throw new Error(`record mode needs these env vars: ${missing.join(', ')}`);
  }
  return values;
}

/**
 * Builds the auth headers the gateway would add, for the profiles record mode supports.
 * @param {object} auth The manifest's `auth`.
 * @param {Record<string, string>} credentials
 * @returns {Record<string, string>}
 */
export function authHeaders(auth, credentials) {
  const value = (name) => {
    if (!credentials[name]) {
      throw new Error(`auth profile ${auth.profile} needs credential ${name}`);
    }
    return credentials[name];
  };
  switch (auth.profile) {
    case 'api-key-header':
      return { [auth.header]: `${auth.prefix ?? ''}${value(auth.credential)}` };
    case 'bearer-static':
      return { authorization: `Bearer ${value(auth.credential)}` };
    case 'basic': {
      const token = Buffer.from(`${value(auth.username)}:${value(auth.password)}`).toString('base64');
      return { authorization: `Basic ${token}` };
    }
    default:
      throw new Error(`record mode does not support auth profile ${auth.profile} yet`);
  }
}

function secretsOf(credentials, headers) {
  return [...Object.values(credentials), ...Object.values(headers)]
    .flatMap((v) => [v, v.replace(/^(Bearer|Basic) /, '')])
    .filter((v) => v.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function redact(text, secrets) {
  return secrets.reduce((out, secret) => out.split(secret).join('<redacted>'), text);
}

function fixtureBody(body) {
  if (body === undefined) {
    return undefined;
  }
  try {
    const value = JSON.parse(body);
    if (typeof value === 'object' && value !== null) {
      return value;
    }
  } catch {
    // not JSON: keep the string
  }
  return body;
}

function redactJson(value, secrets) {
  return typeof value === 'string'
    ? redact(value, secrets)
    : JSON.parse(redact(JSON.stringify(value), secrets));
}

/**
 * Creates a recorder that sends fake-host calls to the real vendor sandbox and keeps a
 * redacted copy of each request and response as an interaction.
 * @param {object} opts
 * @param {object} opts.manifest
 * @param {Record<string, string|undefined>} [opts.env]
 * @param {typeof fetch} [opts.fetch]
 * @param {number} [opts.timeoutMs]
 */
export function createRecorder({
  manifest,
  env = process.env,
  fetch = globalThis.fetch,
  timeoutMs = LIMITS.workerTimeoutMs,
}) {
  const credentials = credentialsFromEnv(manifest, env);
  const auth = authHeaders(manifest.auth, credentials);
  const secrets = secretsOf(credentials, auth);
  const interactions = [];

  async function send(type, {
    method, url, headers = {}, body, bodyEncoding, bytes,
  }) {
    const isEgress = type === 'egress';
    const wireBody = bodyEncoding === 'base64' ? Buffer.from(body, 'base64') : body;
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: isEgress ? { ...headers, ...auth } : headers,
        body: isEgress ? wireBody : bytes,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e.name === 'TimeoutError') {
        return { error: { code: 'timeout', message: `${method} ${url} took over ${timeoutMs} ms` } };
      }
      throw e;
    }
    const responseHeaders = {};
    response.headers.forEach((value, name) => {
      if (!DROPPED_RESPONSE_HEADERS.includes(name)) {
        responseHeaders[name] = value;
      }
    });
    const received = Buffer.from(await response.arrayBuffer());
    const isText = TEXT_TYPES.test(responseHeaders['content-type'] ?? '');
    const result = {
      status: response.status,
      headers: responseHeaders,
      body: isText ? received.toString('utf-8') : received.toString('base64'),
    };
    if (!isText) {
      result.bodyEncoding = 'base64';
    }

    const request = { method, url: redact(url, secrets) };
    const recordedBody = isEgress && !bodyEncoding ? fixtureBody(body) : body;
    if (recordedBody !== undefined) {
      request.body = redactJson(recordedBody, secrets);
    }
    interactions.push({
      ...(isEgress ? {} : { type }),
      request,
      response: {
        ...result,
        headers: redactJson(result.headers, secrets),
        body: isText ? redact(result.body, secrets) : result.body,
      },
    });
    return result;
  }

  return { send, interactions };
}

/**
 * Writes interactions to a JSON fixture file that `loadInteractions` can read.
 * @param {string|URL} file
 * @param {object[]} interactions
 */
export async function saveInteractions(file, interactions) {
  await writeFile(file, `${JSON.stringify({ interactions }, null, 2)}\n`);
}
