# AEM Translation Connector SDK

The contract that every AEM translation connector implements, a build that bundles a connector, and tools to test it.

[`connectors/sample`](../../connectors/sample) is a complete connector that uses all of this. Start from a copy of it.

## Write a connector

### Layout

```text
connectors/{id}/
  connector.json        manifest
  package.json          depends only on @adobe/aem-translation-connector-sdk
  src/connector.js      the connector module
  test/                 conformance and unit tests
  test/fixtures/        recorded vendor interactions
```

### Manifest

`connector.json` declares what the connector needs from the host:

```json
{
  "id": "sample",
  "name": "Sample",
  "contract": 1,
  "entry": "connector.js",
  "egressHosts": ["api.sample.example.com"],
  "credentials": [{ "name": "apiKey", "required": true }],
  "auth": { "profile": "api-key-header", "header": "x-api-key", "credential": "apiKey" },
  "options": { "type": "object", "properties": { "project": { "type": "string" } } },
  "capabilities": { "cancel": true, "maxBatchItems": 100, "maxBatchBytes": 5000000, "formats": ["html"] }
}
```

- `egressHosts`: the only vendor hosts the connector can call. `*.example.com` allows any subdomain.
- `credentials` and `auth`: the gateway adds the credentials to each egress request. The connector never sees them.
- `options`: a JSON Schema for the site's settings. Each call gets them as `options`.
- Do not set `version` or `integrity`. The build sets them.

### Module

`src/connector.js` has a default export with the contract methods. Each method gets its input and the `host`:

```js
import { connectorError } from '@adobe/aem-translation-connector-sdk';

const API = 'https://api.sample.example.com/v1';

async function submit({ options, title, items, targets, submissionKey }, host) {
  const res = await host.message({
    type: 'egress',
    method: 'POST',
    url: `${API}/projects/${options.project}/jobs`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: submissionKey, title, targets, documents: items }),
  });
  if (res.error) {
    return res;
  }
  if (res.status === 401) {
    return connectorError('auth-failed', 'the vendor rejected the API key');
  }
  const { id } = JSON.parse(res.body);
  return { state: { jobId: id }, jobs: [{ id, targets }] };
}

export default { languages, submit, status, fetch, cancel, reconcile };
```

Rules:

- `languages`, `submit`, `status`, and `fetch` are required. `cancel` and `reconcile` are optional. Define `cancel` only when `capabilities.cancel` is `true`.
- All I/O goes through `host.message`: `egress` for vendor calls, `upload` for asset bytes, and `log`. Do not use `fetch`, timers, storage, or the DOM.
- Return errors with `connectorError(code, message)`. Do not throw them. When `host.message` returns `{ error }`, return it as it is.
- `state` holds vendor ids and cursors only. It is JSON, at most 64 KB, and never holds content or secrets. The host stores it and passes it to the next call.
- Pass `submissionKey` to the vendor, so that `reconcile` can find the job after a crash.
- Each call must finish in 15 s. Vendor work is async: submit, then poll with `status`.

The `Connector` JSDoc type in [`src/contract.js`](src/contract.js) has every input and result shape.

### Build

```bash
npx aem-connector-build
```

The build bundles `src/connector.js` into one self-contained ES module, `dist/connector.js`. It then writes `dist/connector.json`, which has the `version` from `package.json` and the bundle's `sha384` integrity. The build fails if the manifest is not valid, or if the bundle uses a banned global.

## Test a connector

`@adobe/aem-translation-connector-sdk/testing` has a fake host. It stands in for the real host in tests.

### Replay

The fake host answers each `host.message` call from recorded interactions. Tests need no network and no credentials.

```js
import { createFakeHost, loadInteractions } from '@adobe/aem-translation-connector-sdk/testing';

const interactions = await loadInteractions(new URL('fixtures/submit.json', import.meta.url));
const { host, pending } = createFakeHost({ manifest, interactions });
```

The fake host enforces the host rules. It throws `HostPolicyError` on a host that is not in `egressHosts`, on http, or on an unknown asset.

### Record

Record mode sends each call to the vendor sandbox and keeps a redacted copy as an interaction.

1. Set each credential as an env var named `CONNECTOR_<ID>_<FIELD>`, for example `CONNECTOR_SAMPLE_APIKEY`.
2. Create a recorder and pass it to the fake host.
3. Save the interactions as a fixture.

```js
import { createFakeHost, createRecorder, saveInteractions } from '@adobe/aem-translation-connector-sdk/testing';

const recorder = createRecorder({ manifest });
const { host } = createFakeHost({ manifest, recorder });
await connector.languages({ options }, host);
await saveInteractions(new URL('fixtures/languages.json', import.meta.url), recorder.interactions);
```

Record mode supports the `api-key-header`, `bearer-static`, and `basic` auth profiles.

Before it keeps an interaction, record mode removes credential values from the URL, the request body, the response headers, and text response bodies. It also drops the `set-cookie`, `authorization`, and `www-authenticate` response headers. It cannot redact binary bodies. Check each fixture before you commit it.

### Conformance suite

Every connector must pass the conformance suite. Run it against the built bundle, because that is what ships. It registers mocha tests:

```js
import { readFile } from 'node:fs/promises';
import { conformance, loadInteractions } from '@adobe/aem-translation-connector-sdk/testing';
import connector from '../dist/connector.js';

const manifest = JSON.parse(await readFile(new URL('../dist/connector.json', import.meta.url), 'utf-8'));
const load = (name) => loadInteractions(new URL(`fixtures/${name}.json`, import.meta.url));

conformance({
  connector,
  manifest,
  entry: new URL('../dist/connector.js', import.meta.url),
  options: { project: 'demo' },
  scenarios: {
    languages: { interactions: await load('languages') },
    submit: { input: { title, items, targets, submissionKey }, interactions: await load('submit') },
    status: { interactions: await load('status') },
    fetch: { interactions: await load('fetch') },
    errors: [{ method: 'languages', interactions: await load('auth-failed'), code: 'auth-failed' }],
  },
});
```

The suite checks:

- The manifest is valid, and the module exports the contract methods. `cancel` must match `capabilities.cancel`.
- The bundle uses no banned globals, such as `fetch`, `window`, `document`, `XMLSerializer`, timers, or storage. It must import nothing.
- Each method returns the contract shape within 15 s.
- `state` is plain JSON, at most 64 KB, and holds no item content. Submit, status, and fetch run in order. Each step gets the previous `state` after a JSON round trip.
- The submit scenario stays within `maxBatchItems`, `maxBatchBytes`, and the declared kinds. No egress body goes over 10 MB.
- Each recorded interaction is used.
- Each error scenario returns the expected error code.

## Entry points

- `@adobe/aem-translation-connector-sdk`: contract constants and types, error helpers, and the manifest schema and validator.
- `@adobe/aem-translation-connector-sdk/testing`: fake host, recorder, conformance suite, and checks.
- `@adobe/aem-translation-connector-sdk/build`: `buildConnector()`, the API behind `aem-connector-build`.

### State from earlier releases

The host stores `state` between calls, so a job that started on one release can finish on the next. Within a major, each release must read the `state` that every earlier release wrote.

Each connector keeps one state fixture per release in `test/fixtures/states/<version>.json`. A fixture holds the status and fetch calls of the conformance flow, with their `state` and recorded interactions. Pass the fixtures to the suite:

```js
import { loadStateFixtures } from '@adobe/aem-translation-connector-sdk/testing';

const statesDir = new URL('fixtures/states/', import.meta.url);

conformance({
  // ...
  states: await loadStateFixtures(statesDir),
  saveStatesTo: process.env.CONNECTOR_SAVE_STATES ? statesDir : undefined,
});
```

- The suite replays each fixture in the same major as `manifest.version` against the current bundle. Fixtures from other majors are skipped.
- `CONNECTOR_SAVE_STATES=1` writes the fixture for the current version. Commit it with the release. The sample has an `npm run save-states` script for this.
- State checks need the built `dist/connector.json`, because they read `version` from it.

## Release rules

Within a major, a site can move to a new release without any action from an admin. So some manifest changes need a new major:

- a new `egressHosts` or `signedUrlHosts` host
- a new required credential field, or an optional one that becomes required
- a new required option
- a changed `auth.profile`
- a removed `kind`

`aem-connector-check-release --base <ref>` compares each `connectors/*/connector.json` with `<ref>`. When a connector has one of these changes, a commit since `<ref>` that touches the connector must mark a breaking change: `feat(<id>)!: …` or a `BREAKING CHANGE:` footer. Semantic-release then releases a new major. CI runs the check against `origin/main` on branches, and against the previous commit on `main`.

The repo merges with squash, so the PR title becomes the commit on `main`. Put the `!` in the PR title too.
