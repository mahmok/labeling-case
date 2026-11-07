import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { PostgresTransaction } from "../../../src/db/postgres/postgres.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { Printer } from "../../../src/printers/domain.ts";
import type { CreatePrinterInput, GetPrintersInput } from "../../../src/printers/repository/interface.ts";
import { PostgresPrintersRepository } from "../../../src/printers/repository/postgres.ts";

let container: StartedPostgreSqlContainer | undefined;
let unitOfWork: UnitOfWork<PostgresTransaction>;
let closeTestDatabase: () => Promise<void> = async () => {};

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

const getPrinters = async (input: GetPrintersInput): Promise<Printer[]> => {
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
    Object.assign(config.database, {
      dialect: "postgresql",
      host: container.getHost(),
      name: container.getDatabase(),
      password: container.getPassword(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
    });

    const database = await createDatabase();
    if (database.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    unitOfWork = database.uow;
    closeTestDatabase = database.close;
    await migrate(database.db, { migrationsFolder: resolve(import.meta.dir, "../../../migrations") });
  }, 120_000);

  afterAll(async () => {
    await closeTestDatabase();
    await container?.stop();
  }, 30_000);

  test("enforces unique printer names", async () => {
    const existing = await createPrinter();
    const duplicate = await unitOfWork.execute((tx) =>
      PostgresPrintersRepository.create(
        [
          {
            location: "another location",
            model: "another model",
            name: existing.name,
            serialNumber: `serial-${crypto.randomUUID()}`,
          },
        ],
        tx,
      ),
    );

    expect(duplicate.isOk).toBe(false);
    expect(await getPrinters({ name: [existing.name] })).toEqual([existing]);
  });

  test("creates printers and retrieves them by generated ID", async () => {
    const created = await createPrinter();
    const [retrieved] = await getPrinters({ id: [created.id] });

    expect(retrieved).toEqual(created);
  });

  test("filters by exact name and serial number", async () => {
    const marker = crypto.randomUUID();
    const matching = await createPrinter({ name: `North office ${marker}`, serialNumber: `serial-${marker}` });
    await createPrinter({ name: `South office ${marker}`, serialNumber: `other-${marker}` });

    const result = await getPrinters({
      name: [matching.name],
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
      name: printers.map(({ name }) => name),
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
