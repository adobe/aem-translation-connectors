# AEM Translation Connector SDK

The contract that every AEM translation connector implements, plus tools to test a connector against it.

## Installation

```bash
npm install --save-dev @adobe/aem-translation-connector-sdk
```

## Usage

```js
import { CONTRACT_VERSION } from '@adobe/aem-translation-connector-sdk';
```

## Testing a connector

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
// ...call the connector with host...
await saveInteractions(new URL('fixtures/submit.json', import.meta.url), recorder.interactions);
```

Record mode supports the `api-key-header`, `bearer-static`, and `basic` auth profiles.

Before it keeps an interaction, record mode removes credential values from the URL, the request body, the response headers, and text response bodies. It also drops the `set-cookie`, `authorization`, and `www-authenticate` response headers. It cannot redact binary bodies. Check each fixture before you commit it.

### Conformance suite

Every connector must pass the conformance suite. It registers mocha tests:

```js
import { conformance, loadInteractions } from '@adobe/aem-translation-connector-sdk/testing';
import connector from '../src/connector.js';
import manifest from '../connector.json' with { type: 'json' };

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
    errors: [{ name: 'bad key', method: 'languages', interactions: await load('auth-failed'), code: 'auth-failed' }],
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

A connector receives the host as the second argument of each method, for example `submit(input, host)`.
