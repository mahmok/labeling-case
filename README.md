# Labeling Platform

Full-stack TypeScript platform for labeling workflows: managing labels and printers, printing labels, and monitoring background jobs.

- **Backend** ([`backend`](backend)): a Bun and Hono REST API plus a background worker. They run as separate processes and share one PostgreSQL database.
- **Frontend** ([`frontend`](frontend)): a React single-page app built with Vite, with pages for prints, labels, printers and jobs.

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

Open the frontend at <http://localhost:8080>.

## Tests

```bash
bun run --filter backend test
```

Integration and end-to-end tests use Testcontainers; see [`backend/tests/README.md`](backend/tests/README.md).

## Documentation

- [Tech stack](doc/tech-stack.md): high-level view of the technologies used and what each is for
- [Backend architecture](doc/backend-architecture.md): conceptual and concrete views of the backend structure
- [Design principles](doc/design-principles.md): the main design decisions behind the system
- [AWS deployment options](doc/deployment.md): ways to deploy to AWS, with diagrams

## Reference

- Root and backend scripts: [`package.json`](package.json), [`backend/package.json`](backend/package.json)
- Compose services and profiles: [`docker-compose.yaml`](docker-compose.yaml)
- Runtime configuration: [`backend/src/config.ts`](backend/src/config.ts)
- Database schemas and migrations: [`backend/src`](backend/src), [`backend/migrations`](backend/migrations)
- Backend container image: [`backend/Dockerfile`](backend/Dockerfile)
- Frontend container image: [`frontend/Dockerfile`](frontend/Dockerfile)
