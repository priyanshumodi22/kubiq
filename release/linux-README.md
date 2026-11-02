# kubiq Linux bundle

Includes the application, web assets, tracing runtime and a Node 22 executable for
the named architecture. Requires a glibc Linux host compatible with Debian 12
(bookworm); Alpine/musl is not supported by this bundle. No system Node is needed.

1. Extract the ZIP, retaining executable permissions.
2. Run `./kubiq --check` to validate runtime, assets and tracing bootstrap.
3. Copy `.env.example` to `.env`. Set a unique JWT secret, database credentials
   and the actual frontend origin. Never expose an unconfigured instance publicly.
4. Run `./kubiq`. Open `http://localhost:3001/kubiq/` with the example configuration.

`./kubiq --version` prints the release tag. `release.json` records source SHA and
architecture. The launcher resolves assets relative to its own directory.
Database connectivity and application flows require separate configured smoke tests;
`--check` does not claim database or end-to-end verification.
