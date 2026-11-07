import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApi } from "../../src/api.ts";
import { createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";

let container: StartedPostgreSqlContainer | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let origin: string;
let application: Awaited<ReturnType<typeof createApplication>>;

const request = (path: string): Promise<Response> => fetch(`${origin}${path}`);
const post = (path: string, body: unknown): Promise<Response> =>
  fetch(`${origin}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

describe("Prints API (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_prints_api_e2e")
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

    application = await createApplication();
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

  test("prints locally and supports get-by-ID and filtered list routes", async () => {
    const marker = crypto.randomUUID();
    const labelResult = await application.useCases.labels.createLabel([
      { id: `print-label-${marker}`, isPrimary: false, name: `Shipping ${marker}`, version: "v1" },
    ]);
    const printerResult = await application.useCases.printers.createPrinter([
      { location: "", model: "model", name: `Print printer ${marker}`, serialNumber: "" },
    ]);
    if (!(labelResult.isOk && printerResult.isOk)) throw new Error("Could not create lookup fixtures");
    const [label] = labelResult.value;
    const [printer] = printerResult.value;
    if (!(label && printer)) throw new Error("Lookup fixtures were not created");

    const response = await post("/api/v1/prints", { labelId: label.id, printerName: printer.name });
    const created = (await response.json()) as { data: { id: string; printer: { id: string | null } } };

    expect(response.status).toBe(201);
    expect(created.data.printer.id).toBe(printer.id);

    const byId = await request(`/api/v1/prints/${created.data.id}`);
    expect(byId.status).toBe(200);
    expect(await byId.json()).toMatchObject({ data: { id: created.data.id, label: { id: label.id } } });

    const list = await request(`/api/v1/prints?printerName=${encodeURIComponent(printer.name)}&sort=-createdAt`);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ data: [{ id: created.data.id }] });
  });

  test("falls back to vendor lookups when local lookup fails", async () => {
    const response = await post("/api/v1/prints", { labelId: "lbl-001", printerName: "Office Printer" });
    const body = (await response.json()) as { data: { printer: { id: string | null }; label: { id: string } } };

    expect(response.status).toBe(201);
    expect(body.data.label.id).toBe("lbl-001");
    expect(body.data.printer.id).toBeNull();
  });
});
