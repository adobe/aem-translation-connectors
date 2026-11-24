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
