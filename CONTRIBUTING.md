# Contributing to AEM Translation Connectors

This project welcomes contributions from everyone who finds it useful or lacking.

## Code of Conduct

This project follows the Adobe [code of conduct](CODE_OF_CONDUCT.md). By taking part, you agree to follow it. Report unacceptable behavior to Grp-opensourceoffice@adobe.com.

## Contributor License Agreement

All third-party contributions need a signed contributor license agreement. It gives Adobe permission to redistribute your contribution. [Sign the Adobe CLA](https://opensource.adobe.com/cla.html). You only sign it once.

## Before you contribute

- Make sure a GitHub issue exists for the change.
- Check for open pull requests that overlap with your change.

## How to contribute

1. Fork the repository.
2. Make your changes on a branch in your fork.
3. Open a pull request from that branch.

In the pull request:

- Link the related issue.
- Say what the change does and what it can break.
- Follow the [pull request template](.github/pull_request_template.md).

## Code style

ESLint enforces the style, including the Apache license header in each source file. Run `npm run lint` before you push. CI runs the same check on every pull request. `npx eslint . --fix` fixes some problems for you.

## Commit messages

Use [conventional commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`. The release tooling reads them to pick the next version and to write release notes. Use the connector id as the scope, for example `fix(deepl): map 456 to rate-limited`.

The repo merges with squash. The PR title becomes the commit on `main`, so it must follow the same format.

## Review

A maintainer reviews each pull request. Feedback comes as comments on the pull request.

## Add a connector

1. Open an issue for the vendor. Link the vendor's API docs.
2. Copy `connectors/sample` to `connectors/<id>`. The id is lowercase, with letters, digits, and dashes.
3. Rename the package to `@adobe/aem-translation-connector-<id>`.
4. Write `connector.json` and `src/connector.js`. The [SDK README](packages/sdk/README.md) explains the manifest, the module rules, and the build.
5. Write fixtures from the vendor's API docs, or capture responses from the vendor sandbox.
6. Pass the conformance suite with `npm test`. Add error scenarios for the vendor's auth, rate-limit, and server errors.

A connector depends only on `@adobe/aem-translation-connector-sdk`.

## Review rules for connector changes

- `egressHosts` lists vendor API hosts only. Never add shared hosting or a CDN.
- The connector never handles credentials. The gateway adds them by `auth.profile`.
- `state` holds vendor ids and cursors only, never content or secrets.
- Fixtures hold no credentials, tokens, or customer content.

## Keep majors rare

A new major is needed only for a breaking change for sites: a new vendor host, a new required credential or option, a changed `auth.profile`, or a removed `kind`. Add new credential fields and options as optional first. Take regional vendor hosts as an option, checked against a `*.` wildcard in `egressHosts`.
