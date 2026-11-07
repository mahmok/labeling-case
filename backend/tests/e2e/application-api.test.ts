import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "../../src/app.ts";
import { config } from "../../src/config.ts";

let container: StartedPostgreSqlContainer | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let origin: string;

const request = (path: string): Promise<Response> => fetch(`${origin}${path}`);

describe("Application API (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_application_e2e")
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

    const app = await createApp();
    if (app.db.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    closeDatabase = app.db.close;
    await migrate(app.db.db, { migrationsFolder: resolve(import.meta.dir, "../../migrations") });
    server = Bun.serve({ fetch: app.api.fetch, port: 0 });
    origin = `http://localhost:${server.port}`;
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
    await closeDatabase();
    await container?.stop();
  }, 30_000);

  test("serves the health status", async () => {
    expect(await (await request("/health")).json()).toEqual({ status: "running" });
  });

  test("serves one OpenAPI document for printers and labels at the API root", async () => {
    const response = await request("/openapi.json");
    const document = (await response.json()) as { paths: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty("/api/v1/printers/{id}");
    expect(document.paths).toHaveProperty("/api/v1/labels/{id}");
  });
});
