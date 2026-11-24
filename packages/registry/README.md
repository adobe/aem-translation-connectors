# AEM Translation Connector Registry

Says which exact version of each connector major is live, with its integrity hash and lifecycle dates.

Site config names only a connector `id` and a major. The gateway and the MCP worker bundle the same registry version. The gateway serves it to the browser. A rollback is a new registry release.

## Data

`registry.json`:

```json
{
  "connectors": {
    "sample": {
      "majors": {
        "2": {
          "version": "2.1.0",
          "integrity": "sha384-…",
          "releasedAt": "2026-03-10T00:00:00Z",
          "previous": { "version": "2.0.0", "integrity": "sha384-…", "until": "2026-03-11T00:00:00Z" },
          "rollout": { "version": "2.2.0", "integrity": "sha384-…", "orgs": ["<ims-org-id>"] }
        },
        "1": {
          "version": "1.4.0",
          "integrity": "sha384-…",
          "releasedAt": "2026-01-01T00:00:00Z",
          "deprecatedAt": "2026-03-10T00:00:00Z",
          "retiredAt": "2026-05-09T00:00:00Z",
          "removedAt": "2026-06-08T00:00:00Z"
        }
      },
      "manifests": { "2.1.0": { "…": "built connector.json" } }
    }
  }
}
```

- `previous`: the version before the current one. It is still accepted until `until`, at most 24 h after `releasedAt`.
- `rollout`: a staged version for the listed orgs only.
- `manifests`: the built `connector.json` of each listed version.
- Lifecycle: when a new major ships, the previous major is deprecated. It is retired 60 days later (no new submissions), and removed 30 days after that. At most two majors are live per connector. The stage is computed from the dates, so it changes without a new release.

CI generates `registry.json` when it releases (#10). Until then it is empty.

## API

```js
import { resolveConnector, isAccepted } from '@adobe/aem-translation-connector-registry';
import registry from '@adobe/aem-translation-connector-registry/registry.json' with { type: 'json' };

const pick = resolveConnector(registry, { id: 'sample', major: 2, org });
// { id, major, version, integrity, manifest, stage, canSubmit } or null

isAccepted(registry, { id: 'sample', major: 2, version, integrity, org });
```

- `resolveConnector`: the version a site gets. It returns `null` when the connector or major is unknown or removed. `canSubmit` is `false` once the major is retired.
- `isAccepted`: whether the host should accept a version that a client loaded. It accepts the current version, the rollout version for orgs in the rollout, and the previous version inside its window.
- `stageOf(major, now)` and `lifecycleDates(deprecatedAt)`: lifecycle helpers.

`@adobe/aem-translation-connector-registry/validate` has `validateRegistry(registry, { now })`. It checks the shape, the dates, and the lifecycle rules. It also checks that each listed version matches its built manifest. It needs ajv, so the main entry does not load it.
