import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApi } from "../../src/api.ts";
import { type ApplicationUseCases, createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";

let container: StartedPostgreSqlContainer | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let useCases: ApplicationUseCases;
let origin: string;

const request = (path: string): Promise<Response> => fetch(`${origin}${path}`);
describe("Application", () => {
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

    const application = await createApplication();
    if (application.db.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    closeDatabase = application.db.close;
    useCases = application.useCases;
    await migrate(application.db.db, { migrationsFolder: resolve(import.meta.dir, "../../migrations") });
    server = Bun.serve({ fetch: createApi(useCases).fetch, port: 0 });
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

  test("exposes vendor data use cases for other application modules", async () => {
    const [printers, labels] = await Promise.all([
      useCases.printers.getVendorPrinters(),
      useCases.labels.getVendorLabels(),
    ]);

    expect(printers.isOk).toBe(true);
    expect(labels.isOk).toBe(true);
    if (printers.isOk) expect(printers.value[0]).toEqual({ model: "HP LaserJet Pro", name: "Office Printer" });
    if (labels.isOk) expect(labels.value[0]).toEqual({ id: "lbl-001", name: "Fragile", version: 1 });
  });

  test("serves one OpenAPI document for all resources at the API root", async () => {
    const response = await request("/openapi.json");
    const document = (await response.json()) as { paths: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty("/api/v1/printers/{id}");
    expect(document.paths).toHaveProperty("/api/v1/labels/{id}");
    expect(document.paths).toHaveProperty("/api/v1/jobs");
    expect(document.paths).toHaveProperty("/api/v1/jobs/{id}");
    expect(document.paths).toHaveProperty("/api/v1/prints");
    expect(document.paths).toHaveProperty("/api/v1/prints/{id}");
  });
});
