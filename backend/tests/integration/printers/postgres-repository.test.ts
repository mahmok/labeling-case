import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createApp } from "../../../src/app.ts";
import schema from "../../../src/db/postgres/schema.ts";
import { createUnitOfWork } from "../../../src/db/unit-of-work.ts";
import { createPrintersApi } from "../../../src/printers";
import type { Printer } from "../../../src/printers/domain.ts";
import type { CreatePrinterInput } from "../../../src/printers/repository/interface.ts";
import { PostgresPrintersRepository } from "../../../src/printers/repository/postgres.ts";

type TestDatabase = NodePgDatabase<typeof schema>;
type TestTransaction = Parameters<Parameters<TestDatabase["transaction"]>[0]>[0];

let container: StartedPostgreSqlContainer | undefined;
let pool: Pool | undefined;
let testDb: TestDatabase;

const unitOfWork = createUnitOfWork<TestTransaction>((operation) => testDb.transaction(operation));
const printersApi = createPrintersApi({ repository: PostgresPrintersRepository, uow: unitOfWork });

const createPrinter = async (overrides: Partial<CreatePrinterInput> = {}): Promise<Printer> => {
  const unique = crypto.randomUUID();
  const input: CreatePrinterInput = {
    location: `location-${unique}`,
    model: `model-${unique}`,
    name: `printer-${unique}`,
    serialNumber: `serial-${unique}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => PostgresPrintersRepository.create([input], tx));
  if (!result.isOk) throw result.error;

  const printer = result.value[0];
  if (!printer) throw new Error("Expected printer creation to return a row");
  return printer;
};

const getPrinters = async (input: Parameters<typeof PostgresPrintersRepository.get>[0]): Promise<Printer[]> => {
  const result = await unitOfWork.execute((tx) => PostgresPrintersRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("PostgresPrintersRepository", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_test")
      .withUsername("test")
      .withPassword("test")
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    testDb = drizzle(pool, { schema });
    await migrate(testDb, { migrationsFolder: resolve(import.meta.dir, "../../../migrations") });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  }, 30_000);

  test("serves its OpenAPI document from the composed app", async () => {
    const app = await createApp({ db: testDb, dialect: "postgresql", uow: unitOfWork });
    const response = await app.api.request("/api/v1/printers/openapi.json");
    const document = (await response.json()) as { paths: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty("/");
    expect(document.paths).toHaveProperty("/{id}");
  });

  test("creates, filters, and updates printers by nickname", async () => {
    const marker = crypto.randomUUID();
    const nickname = `Front desk ${marker}`;
    const createResponse = await printersApi.request("/", {
      body: JSON.stringify({
        location: `location-${marker}`,
        model: `model-${marker}`,
        name: `printer-${marker}`,
        nickname,
        serialNumber: `serial-${marker}`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(createResponse.status).toBe(201);
    const { data: created } = (await createResponse.json()) as { data: Printer };
    expect(created).toMatchObject({ nickname });

    const listResponse = await printersApi.request(`/?nickname=${encodeURIComponent(marker.slice(0, 8))}`);
    expect(await listResponse.json()).toMatchObject({ data: [{ id: created.id, nickname }] });

    const updateResponse = await printersApi.request(`/${created.id}`, {
      body: JSON.stringify({ nickname: null }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({ data: { id: created.id, nickname: null } });
  });

  test("creates printers and retrieves them by generated ID", async () => {
    const created = await createPrinter();
    const [retrieved] = await getPrinters({ id: [created.id] });

    expect(retrieved).toEqual(created);
  });

  test("filters by partial name and exact serial number", async () => {
    const marker = crypto.randomUUID();
    const matching = await createPrinter({ name: `North office ${marker}`, serialNumber: `serial-${marker}` });
    await createPrinter({ name: `South office ${marker}`, serialNumber: `other-${marker}` });

    const result = await getPrinters({
      name: [`north office ${marker.slice(0, 8)}`],
      serialNumber: [matching.serialNumber],
    });

    expect(result.map(({ id }) => id)).toEqual([matching.id]);
  });

  test("sorts and paginates only the matching test records", async () => {
    const marker = crypto.randomUUID();
    const printers = await Promise.all([
      createPrinter({ name: `printer-${marker}-c` }),
      createPrinter({ name: `printer-${marker}-a` }),
      createPrinter({ name: `printer-${marker}-b` }),
    ]);

    const result = await getPrinters({
      name: [marker],
      pagination: { limit: 1, offset: 1 },
      sorting: [{ direction: "ASC", key: "name" }],
    });

    expect(result.map(({ name }) => name)).toEqual([`printer-${marker}-b`]);
    expect(printers).toHaveLength(3);
  });

  test("updates multiple printers with different values", async () => {
    const first = await createPrinter();
    const second = await createPrinter();
    const marker = crypto.randomUUID();

    const updated = await unitOfWork.execute((tx) =>
      PostgresPrintersRepository.update(
        [
          { id: first.id, name: `updated-first-${marker}` },
          { id: second.id, location: `updated-location-${marker}` },
        ],
        tx,
      ),
    );
    if (!updated.isOk) throw updated.error;

    const byId = new Map(updated.value.map((printer) => [printer.id, printer]));
    expect(byId.get(first.id)?.name).toBe(`updated-first-${marker}`);
    expect(byId.get(second.id)?.location).toBe(`updated-location-${marker}`);
  });

  test("deletes only the requested printer", async () => {
    const target = await createPrinter();
    const retained = await createPrinter();

    const deleted = await unitOfWork.execute((tx) => PostgresPrintersRepository.delete([target.id], tx));
    if (!deleted.isOk) throw deleted.error;

    expect(await getPrinters({ id: [target.id] })).toEqual([]);
    expect((await getPrinters({ id: [retained.id] })).map(({ id }) => id)).toEqual([retained.id]);
  });

  test("sorts list responses with +field and -field query syntax", async () => {
    const marker = crypto.randomUUID();
    const names = [`sort-${marker}-c`, `sort-${marker}-a`, `sort-${marker}-b`];
    await Promise.all(names.map((name) => createPrinter({ name })));

    const ascendingQuery = new URLSearchParams({ name: marker, sort: "+name" });
    const ascendingResponse = await printersApi.request(`/?${ascendingQuery}`);
    const ascending = (await ascendingResponse.json()) as { data: Printer[] };
    expect(ascending.data.map(({ name }) => name)).toEqual([
      `sort-${marker}-a`,
      `sort-${marker}-b`,
      `sort-${marker}-c`,
    ]);

    const descendingQuery = new URLSearchParams({ name: marker, sort: "-name" });
    const descendingResponse = await printersApi.request(`/?${descendingQuery}`);
    const descending = (await descendingResponse.json()) as { data: Printer[] };
    expect(descending.data.map(({ name }) => name)).toEqual([
      `sort-${marker}-c`,
      `sort-${marker}-b`,
      `sort-${marker}-a`,
    ]);
  });

  test("serves printer create, read, update, and delete over HTTP", async () => {
    const marker = crypto.randomUUID();
    const createdResponse = await printersApi.request("/", {
      body: JSON.stringify({
        location: `location-${marker}`,
        model: `model-${marker}`,
        name: `printer-${marker}`,
        serialNumber: `serial-${marker}`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { data: Printer };

    const fetchedResponse = await printersApi.request(`/${created.data.id}`);
    expect(fetchedResponse.status).toBe(200);
    expect(await fetchedResponse.json()).toEqual({ data: created.data });

    const updatedResponse = await printersApi.request(`/${created.data.id}`, {
      body: JSON.stringify({ name: `updated-${marker}` }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    expect(updatedResponse.status).toBe(200);
    expect(await updatedResponse.json()).toMatchObject({ data: { id: created.data.id, name: `updated-${marker}` } });

    const deletedResponse = await printersApi.request(`/${created.data.id}`, { method: "DELETE" });
    expect(deletedResponse.status).toBe(204);
    const missingResponse = await printersApi.request(`/${created.data.id}`);
    expect(missingResponse.status).toBe(404);
  });

  test("rejects invalid printer payloads with a client error", async () => {
    const response = await printersApi.request("/", {
      body: JSON.stringify({ name: "incomplete" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { message: expect.any(String) } });
  });

  test("rejects updates containing duplicate IDs without changing rows", async () => {
    const printer = await createPrinter();
    const result = await unitOfWork.execute((tx) =>
      PostgresPrintersRepository.update(
        [
          { id: printer.id, name: "first update" },
          { id: printer.id, name: "duplicate update" },
        ],
        tx,
      ),
    );
    const [unchanged] = await getPrinters({ id: [printer.id] });

    expect(result.isOk).toBe(false);
    expect(unchanged?.name).toBe(printer.name);
  });
});
