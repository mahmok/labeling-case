# Tests

Tests use Bun's built-in `bun:test` runner; no additional test framework or configuration is required.

- `src/**/*.test.ts` — unit tests colocated with the implementation they exercise.
- `tests/integration/**/*.test.ts` — tests using real adapters. The Postgres repository suite starts one Testcontainers database, applies the checked-in Drizzle migrations once, and uses unique fixtures without clearing rows between tests.

Run `bun run test` for all tests, or use `bun run test:unit` and `bun run test:integration` to run a suite separately. Use `bun run test:watch` during development.
