import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApi } from "../../src/api.ts";
import { createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";
import type { Job } from "../../src/jobs/domain.ts";

const jobsPath = "/api/v1/jobs";
const jsonHeaders = { "content-type": "application/json" };

let container: StartedPostgreSqlContainer | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let origin: string;

const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${origin}${path}`, init);

describe("Jobs API (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_jobs_api_e2e")
      .withUsername("test")
      .withPassword("test")
      .start();
    Object.assign(config.database, {
      dialect: "postgresql",
      host: container.getHost(),
      name: container.getDatabase(),
      password: container.getPassword(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
    });

    const application = await createApplication();
    if (application.db.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    closeDatabase = application.db.close;
    await migrate(application.db.db, { migrationsFolder: resolve(import.meta.dir, "../../migrations") });
    server = Bun.serve({ fetch: createApi(application.useCases).fetch, port: 0 });
    origin = `http://localhost:${server.port}`;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
    await closeDatabase();
    await container?.stop();
  }, 30_000);

  test("POST queues a job with API trigger details", async () => {
    const response = await request(jobsPath, {
      body: JSON.stringify({ type: "sync-printers" }),
      headers: jsonHeaders,
      method: "POST",
    });
    const { data } = (await response.json()) as { data: Job };

    expect(response.status).toBe(202);
    expect(data).toMatchObject({
      attempts: 0,
      durationMs: null,
      id: expect.any(String),
      startedAt: null,
      status: "pending",
      triggeredBy: "api",
      type: "sync-printers",
    });
  });

  test("GET lists jobs with filters and pagination", async () => {
    const created = await request(jobsPath, {
      body: JSON.stringify({ type: "sync-labels" }),
      headers: jsonHeaders,
      method: "POST",
    });
    const { data: job } = (await created.json()) as { data: Job };
    const query = new URLSearchParams({ limit: "10", status: "pending", type: "sync-labels" });
    const response = await request(`${jobsPath}?${query}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: job.id, status: "pending", type: "sync-labels" }] });
  });

  test("GET retrieves a job by ID and returns 404 for an unknown ID", async () => {
    const created = await request(jobsPath, {
      body: JSON.stringify({ type: "sync-printers" }),
      headers: jsonHeaders,
      method: "POST",
    });
    const { data: job } = (await created.json()) as { data: Job };

    expect(await (await request(`${jobsPath}/${job.id}`)).json()).toMatchObject({ data: { id: job.id } });
    expect((await request(`${jobsPath}/${crypto.randomUUID()}`)).status).toBe(404);
  });

  test("rejects unsupported job types and malformed filters", async () => {
    const invalidJob = await request(jobsPath, {
      body: JSON.stringify({ type: "unknown-job" }),
      headers: jsonHeaders,
      method: "POST",
    });
    expect(invalidJob.status).toBe(400);
    expect((await request(`${jobsPath}?status=unknown`)).status).toBe(400);
  });
});
