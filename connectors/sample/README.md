# Sample connector

A complete connector for a made-up vendor API at `api.sample.example.com`. It shows the contract, and it passes the conformance suite. Copy it to start a new connector.

It is not published.

## Files

- `connector.json`: manifest. The vendor uses an API key in the `x-api-key` header, and one `project` option.
- `src/connector.js`: the six contract methods. It maps vendor HTTP errors to connector error codes and vendor job states to item statuses.
- `test/conformance.test.js`: the conformance suite, with error scenarios for each method.
- `test/connector.test.js`: unit tests for behavior that the suite does not cover.
- `test/fixtures/`: hand-written vendor interactions. A real connector records them against the vendor sandbox.

## Commands

```bash
npm run build   # writes dist/connector.js and dist/connector.json
npm test        # builds, then runs the tests against the bundle
```
