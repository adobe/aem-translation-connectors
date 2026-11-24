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

Use [conventional commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`. The release tooling reads them to pick the next version and to write release notes.

## Review

A maintainer reviews each pull request. Feedback comes as comments on the pull request.
