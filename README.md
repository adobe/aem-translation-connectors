# AEM Translation Connectors

Connectors that send AEM content to translation vendors and bring the translations back.

Each connector is a single ES module that implements the connector contract. The connector does no I/O of its own. It talks to the vendor only through the host, which adds credentials and enforces the allowed hosts.

## Layout

- `packages/sdk`: the contract types, a fake host for tests, and the conformance suite.
- `connectors/{id}`: one folder per connector.

## Development

```bash
npm install
npm run lint
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt).
