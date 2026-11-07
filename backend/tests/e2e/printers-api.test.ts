import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApi } from "../../src/api.ts";
import { createApplication } from "../../src/application.ts";
import { config } from "../../src/config.ts";
import type { Printer } from "../../src/printers/domain.ts";
import type { CreatePrinterInput } from "../../src/printers/repository/interface.ts";

const printersPath = "/api/v1/printers";
const jsonHeaders = { "content-type": "application/json" };

let container: StartedPostgreSqlContainer | undefined;
let server: ReturnType<typeof Bun.serve> | undefined;
let closeDatabase: () => Promise<void> = async () => {};
let origin: string;

const request = (path: string, init?: RequestInit): Promise<Response> => fetch(`${origin}${path}`, init);

const createPrinter = async (overrides: Partial<CreatePrinterInput> = {}): Promise<Printer> => {
  const marker = crypto.randomUUID();
  const response = await request(printersPath, {
    body: JSON.stringify({
      location: `location-${marker}`,
      model: `model-${marker}`,
      name: `printer-${marker}`,
      serialNumber: `serial-${marker}`,
      ...overrides,
    }),
    headers: jsonHeaders,
    method: "POST",
  });

  if (response.status !== 201) throw new Error(`Failed to create printer fixture: ${await response.text()}`);
  const { data } = (await response.json()) as { data: Printer };
  return data;
};

describe("Printers API (end to end)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling")
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

  describe(`GET ${printersPath}`, () => {
    test("returns a printer matching its ID filter", async () => {
      const printer = await createPrinter();
      const response = await request(`${printersPath}?id=${printer.id}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: [{ id: printer.id }] });
    });

    test("filters by partial nickname", async () => {
      const marker = crypto.randomUUID();
      const printer = await createPrinter({ nickname: `Front desk ${marker}` });
      const response = await request(`${printersPath}?nickname=${encodeURIComponent(marker.slice(0, 8))}`);

      expect(await response.json()).toMatchObject({ data: [{ id: printer.id, nickname: `Front desk ${marker}` }] });
    });

    test("sorts exact name matches in ascending and descending order", async () => {
      const marker = crypto.randomUUID();
      const names = [`sort-${marker}-c`, `sort-${marker}-a`, `sort-${marker}-b`];
      for (const name of names) await createPrinter({ name });

      const createSortQuery = (sort: string): URLSearchParams => {
        const query = new URLSearchParams({ sort });
        for (const name of names) query.append("name", name);
        return query;
      };

      const ascending = await request(`${printersPath}?${createSortQuery("+name")}`);
      const ascendingData = (await ascending.json()) as { data: Printer[] };
      expect(ascendingData.data.map(({ name }) => name)).toEqual([
        `sort-${marker}-a`,
        `sort-${marker}-b`,
        `sort-${marker}-c`,
      ]);

      const descending = await request(`${printersPath}?${createSortQuery("-name")}`);
      const descendingData = (await descending.json()) as { data: Printer[] };
      expect(descendingData.data.map(({ name }) => name)).toEqual([
        `sort-${marker}-c`,
        `sort-${marker}-b`,
        `sort-${marker}-a`,
      ]);
    });

    test("rejects malformed filters", async () => {
      const response = await request(`${printersPath}?limit=not-a-number`);

      expect(response.status).toBe(400);
    });
  });

  describe(`POST ${printersPath}`, () => {
    test("creates and returns a printer", async () => {
      const marker = crypto.randomUUID();
      const response = await request(printersPath, {
        body: JSON.stringify({
          location: `location-${marker}`,
          model: `model-${marker}`,
          name: `printer-${marker}`,
          nickname: `Front desk ${marker}`,
          serialNumber: `serial-${marker}`,
        }),
        headers: jsonHeaders,
        method: "POST",
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        data: { name: `printer-${marker}`, nickname: `Front desk ${marker}` },
      });
    });

    test("rejects an incomplete printer", async () => {
      const response = await request(printersPath, {
        body: JSON.stringify({ name: "incomplete" }),
        headers: jsonHeaders,
        method: "POST",
      });

      expect(response.status).toBe(400);
    });
  });

  describe(`GET ${printersPath}/:id`, () => {
    test("returns the requested printer", async () => {
      const printer = await createPrinter();
      const response = await request(`${printersPath}/${printer.id}`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { id: printer.id } });
    });

    test("returns not found for an unknown printer", async () => {
      const response = await request(`${printersPath}/${crypto.randomUUID()}`);

      expect(response.status).toBe(404);
    });
  });

  describe(`PATCH ${printersPath}/:id`, () => {
    test("updates a printer nickname", async () => {
      const printer = await createPrinter();
      const nickname = `Updated ${crypto.randomUUID()}`;
      const response = await request(`${printersPath}/${printer.id}`, {
        body: JSON.stringify({ nickname }),
        headers: jsonHeaders,
        method: "PATCH",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { id: printer.id, nickname } });
    });

    test("allows clearing the nickname", async () => {
      const printer = await createPrinter({ nickname: `Existing ${crypto.randomUUID()}` });
      const response = await request(`${printersPath}/${printer.id}`, {
        body: JSON.stringify({ nickname: null }),
        headers: jsonHeaders,
        method: "PATCH",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ data: { id: printer.id, nickname: null } });
    });
  });

  describe(`DELETE ${printersPath}/:id`, () => {
    test("deletes the printer", async () => {
      const printer = await createPrinter();
      const response = await request(`${printersPath}/${printer.id}`, { method: "DELETE" });

      expect(response.status).toBe(204);
      expect((await request(`${printersPath}/${printer.id}`)).status).toBe(404);
    });

    test("returns success when deleting an unknown printer", async () => {
      const id = crypto.randomUUID();
      expect((await request(`${printersPath}/${id}`, { method: "DELETE" })).status).toBe(204);
      expect((await request(`${printersPath}/${id}`, { method: "DELETE" })).status).toBe(204);
    });
  });

});
