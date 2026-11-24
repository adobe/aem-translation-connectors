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

export const CONTRACT_VERSION = 1;

export const ITEM_KINDS = Object.freeze(['html', 'asset', 'external']);

export const DEFAULT_KINDS = Object.freeze(['html']);

export const ITEM_STATUSES = Object.freeze([
  'queued',
  'awaiting-authorization',
  'in-progress',
  'ready',
  'failed',
  'cancelled',
]);

export const AUTH_PROFILES = Object.freeze([
  'api-key-header',
  'bearer-static',
  'basic',
  'token-exchange',
  'oauth-client-credentials',
  'oauth-password',
  'platform-credential',
  'user-session',
]);

export const HOST_MESSAGE_TYPES = Object.freeze(['egress', 'upload', 'log']);

export const REQUIRED_METHODS = Object.freeze(['languages', 'submit', 'status', 'fetch']);

export const OPTIONAL_METHODS = Object.freeze(['reconcile', 'cancel']);

export const LIMITS = Object.freeze({
  stateBytes: 64 * 1024,
  egressBodyBytes: 10 * 1024 * 1024,
  maxBatchBytes: 7 * 1024 * 1024,
  workerTimeoutMs: 15_000,
  browserTimeoutMs: 30_000,
});

/**
 * @typedef {'html'|'asset'|'external'} ItemKind
 * @typedef {'queued'|'awaiting-authorization'|'in-progress'|'ready'|'failed'|'cancelled'}
 *   ItemStatus
 * @typedef {Record<string, unknown>} State Opaque JSON, at most 64 KB. Vendor ids and cursors
 *   only, never content or secrets.
 * @typedef {Record<string, unknown>} Options Site options, validated against the manifest's
 *   `options` schema.
 */

/**
 * @typedef {object} HtmlItem
 * @property {string} id
 * @property {'html'} kind
 * @property {string} html Content marked `translate="no"` must stay untranslated.
 * @property {string} path
 * @property {string} sourceLang
 */

/**
 * @typedef {object} AssetItem
 * @property {string} id
 * @property {'asset'} kind
 * @property {string} path
 * @property {string} contentType
 * @property {number} size
 * @property {string} sourceLang
 * @property {string[]} pages
 */

/**
 * @typedef {object} ExternalItem
 * @property {string} id
 * @property {'external'} kind
 * @property {string} ref
 * @property {string} path
 * @property {string} sourceLang
 * @property {string[]} pages
 */

/** @typedef {HtmlItem|AssetItem|ExternalItem} Item */

/**
 * @typedef {object} LanguagePair
 * @property {string} source
 * @property {string[]} targets
 */

/**
 * @typedef {object} LanguagesResult
 * @property {LanguagePair[]|'any'} pairs
 */

/**
 * @typedef {object} SubmitInput
 * @property {Options} options
 * @property {Record<string, unknown>} [submitOptions]
 * @property {Record<string, string>} [context] Files read from DA, keyed by manifest name.
 * @property {string} title
 * @property {Item[]} items
 * @property {string[]} targets
 * @property {string} [dueDate] ISO 8601 date.
 * @property {string} submissionKey Passed to the vendor so `reconcile` can find the job.
 * @property {State} [state]
 */

/**
 * @typedef {object} SubmitResult
 * @property {State} state
 * @property {{ id: string, targets: string[] }[]} jobs
 */

/**
 * @typedef {object} StatusResult
 * @property {State} state
 * @property {{ id: string, lang: string, status: ItemStatus }[]} items
 * @property {number} [progress] 0 to 100.
 */

/**
 * @typedef {{ id: string, lang: string, html: string }
 *   | { id: string, lang: string, url: string, contentType: string }} FetchedItem
 */

/**
 * @typedef {object} FetchResult
 * @property {State} state
 * @property {FetchedItem[]} items
 */

/**
 * @typedef {object} EgressMessage
 * @property {'egress'} type
 * @property {string} url Must be on an `egressHosts` host.
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {string} [body]
 * @property {'base64'} [bodyEncoding] For binary bodies such as zip or multipart.
 */

/**
 * @typedef {object} UploadMessage
 * @property {'upload'} type
 * @property {string} itemId
 * @property {string} url Pre-signed URL on a `signedUrlHosts` host.
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 */

/**
 * @typedef {object} LogMessage
 * @property {'log'} type
 * @property {'debug'|'info'|'warn'|'error'} level
 * @property {string} message
 */

/**
 * @typedef {object} HostResponse The vendor's response to an egress or upload.
 * @property {number} status
 * @property {Record<string, string>} headers Lowercase names.
 * @property {string} body
 * @property {'base64'} [bodyEncoding] Set when the body is binary.
 */

/**
 * @typedef {object} Host
 * @property {(msg: EgressMessage|UploadMessage|LogMessage)
 *   => Promise<HostResponse|import('./errors.js').ErrorResult|void>} message
 *   The only I/O a connector may do. Resolves to an ErrorResult with a host error code
 *   (`timeout`, `payload-too-large`, `vendor-sign-in-required`) when the host stops the call.
 *   `log` resolves to nothing.
 */

/**
 * @typedef {import('./errors.js').ErrorResult} ErrorResult
 */

/**
 * @typedef {object} Connector
 * @property {(input: { options: Options }) => Promise<LanguagesResult|ErrorResult>} languages
 * @property {(input: SubmitInput) => Promise<SubmitResult|ErrorResult>} submit
 * @property {(input: { options: Options, submissionKey: string })
 *   => Promise<{ state: State }|{ notFound: true }|ErrorResult>} [reconcile]
 * @property {(input: { options: Options, state: State })
 *   => Promise<StatusResult|ErrorResult>} status
 * @property {(input: { options: Options, state: State, lang: string, ids: string[] })
 *   => Promise<FetchResult|ErrorResult>} fetch
 *   Must be repeatable until the vendor job closes.
 * @property {(input: { options: Options, state: State, lang?: string })
 *   => Promise<{ state: State }|ErrorResult>} [cancel]
 */
