# Labeling Platform

A Bun/TypeScript backend for labeling workflows. The backend is organized around four domains—printers, labels, prints, and jobs—and can run as an HTTP API, a background worker, or both as separate processes.

## Prerequisites

- [Bun](https://bun.com) 1.3.14
- Docker, for the local PostgreSQL database and containerized workflow
- [mise](https://mise.jdx.dev/) is optional; the repository pins Bun 1.3.14 in `mise.toml`

## Get started locally

If mise is installed but Bun is not, install the project-pinned Bun version:

```bash
mise install
```

Then install dependencies from the repository root:

```bash
bun install
```

If your shell is not configured to activate mise, run Bun commands through mise, for example:

```bash
mise exec -- bun install
```

Start PostgreSQL in Docker. Without a profile, Compose starts only the database:

```bash
docker compose up -d
```

Apply the checked-in database migrations:

```bash
bun run backend:db:migrate
```

Run the API and worker in separate terminals:

```bash
bun run backend:api:dev
bun run backend:worker:dev
```

The API is available at <http://localhost:3000>. The worker exposes a health endpoint at <http://localhost:3001/health>. Stop the local database with `docker compose down`.

## Run the full stack with Docker Compose

The `full` profile starts PostgreSQL, runs migrations as a one-shot service, then starts the API and worker:

```bash
docker compose --profile full up --build
```

Compose waits for PostgreSQL to become healthy before running migrations, and waits for successful migrations before starting either backend process. The API is published on port `3000`; the worker health endpoint is on port `3001`.

Stop the full stack with:

```bash
docker compose --profile full down
```

To run only the migration job (and its database dependency):

```bash
docker compose --profile full run --rm migrate
```

## Useful commands

Root-level scripts:

| Command | Purpose |
| --- | --- |
| `bun run backend:api:dev` | Run the API with watch mode |
| `bun run backend:api:start` | Run the API without watch mode |
| `bun run backend:worker:dev` | Run the worker with watch mode |
| `bun run backend:worker:start` | Run the worker without watch mode |
| `bun run backend:db:migrate` | Apply checked-in migrations using the runtime migration runner |

Backend workspace scripts can be run with `bun run --filter backend <script>`:

| Command | Purpose |
| --- | --- |
| `bun run --filter backend test` | Run all tests |
| `bun run --filter backend test:unit` | Run unit tests |
| `bun run --filter backend test:integration` | Run integration tests |
| `bun run --filter backend test:e2e` | Run end-to-end HTTP tests |
| `bun run --filter backend test:watch` | Run tests in watch mode |
| `bun run --filter backend db:generate` | Generate migrations from the Drizzle schema |

Integration and end-to-end tests use Testcontainers and therefore need Docker running. See [`backend/tests/README.md`](backend/tests/README.md) for how the test suites are organized.

## Database migrations

When changing the PostgreSQL schema, update the relevant schema files under `backend/src/**/schema/postgres.ts`, then generate and review a migration:

```bash
bun run --filter backend db:generate
```

Commit the generated SQL and Drizzle metadata under `backend/migrations/`. Apply migrations locally with `bun run backend:db:migrate`; the `full` Compose profile runs the same runtime migration process before starting the API and worker. The runtime migration runner currently supports PostgreSQL.

## Configuration

Configuration is read from environment variables. Defaults are suitable for the local Compose database:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_DIALECT` | `postgresql` | Database adapter (`postgresql` or `sqlite`) |
| `DATABASE_HOST` | `localhost` | Database host; Compose sets this to `db` |
| `DATABASE_PORT` | `5432` | Database port |
| `DATABASE_NAME` | `labeling` | Database name |
| `DATABASE_USER` | `labeling` | Database user |
| `DATABASE_PASS` | `labeling` | Database password |
| `PORT` | `3000` | API HTTP port |
| `JOBS_WORKER_PORT` | `3001` | Worker health HTTP port |
| `LOG_LEVEL` | `debug` | Logger level |

Job schedules and retry behavior can be configured with `JOBS_LABELS_CRON`, `JOBS_LABELS_RUN_ON_STARTUP`, `JOBS_LABELS_RETRY_*`, `JOBS_PRINTERS_CRON`, `JOBS_PRINTERS_RUN_ON_STARTUP`, and `JOBS_PRINTERS_RETRY_*`. See [`backend/src/config.ts`](backend/src/config.ts) for the full list and defaults.

## API and code layout

- `backend/index.api.ts` — API process entry point
- `backend/index.worker.ts` — background worker entry point
- `backend/src/api.ts` — HTTP routes; API health is at `/health`, OpenAPI JSON at `/openapi.json`, and domain routes are under `/api/v1`
- `backend/src/application.ts` — assembles repositories and use cases
- `backend/src/{printers,labels,prints,jobs}/` — domain schemas, repositories, and use cases
- `backend/src/db/` — database connections and unit-of-work adapters
- `backend/migrations/` — checked-in PostgreSQL migrations
- `docker-compose.yaml` — local PostgreSQL and optional full-stack services
- `backend/Dockerfile` — shared API/worker/migration image
