# Labeling Platform

Bun/TypeScript backend for labeling workflows. The API and background worker run as separate processes.

## Setup

If you use mise, install the project toolchain with `mise install` (see [`mise.toml`](mise.toml)). Then install dependencies:

```bash
bun install
```

## Local development

Start the local database and apply migrations:

```bash
docker compose up -d
bun run backend:db:migrate
```

Run the API and worker in separate terminals:

```bash
bun run backend:api:dev
bun run backend:worker:dev
```

Alternatively, run the full stack in Docker:

```bash
docker compose --profile full up --build
```

## Tests

```bash
bun run --filter backend test
```

Integration and end-to-end tests use Testcontainers; see [`backend/tests/README.md`](backend/tests/README.md).

## Reference

- Root and backend scripts: [`package.json`](package.json), [`backend/package.json`](backend/package.json)
- Compose services and profiles: [`docker-compose.yaml`](docker-compose.yaml)
- Runtime configuration: [`backend/src/config.ts`](backend/src/config.ts)
- Database schemas and migrations: [`backend/src`](backend/src), [`backend/migrations`](backend/migrations)
- Backend container image: [`backend/Dockerfile`](backend/Dockerfile)
