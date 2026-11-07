import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { SQLiteTransaction } from "../../../src/db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import type { Printer } from "../../../src/printers/domain.ts";
import type {
  CreatePrinterInput,
  GetPrintersInput,
  UpdatePrinterInput,
} from "../../../src/printers/repository/interface.ts";
import { SQLitePrintersRepository } from "../../../src/printers/repository/sqlite.ts";

let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createPrinter = async (overrides: Partial<CreatePrinterInput> = {}): Promise<Printer> => {
  const marker = crypto.randomUUID();
  const input: CreatePrinterInput = {
    location: `location-${marker}`,
    model: `model-${marker}`,
    name: `printer-${marker}`,
    serialNumber: `serial-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => SQLitePrintersRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const printer = result.value[0];
  if (!printer) throw new Error("Expected printer creation to return a row");
  return printer;
};

const getPrinters = async (input: GetPrintersInput): Promise<Printer[]> => {
  const result = await unitOfWork.execute((tx) => SQLitePrintersRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

const updatePrinters = async (input: UpdatePrinterInput[]): Promise<Printer[]> => {
  const result = await unitOfWork.execute((tx) => SQLitePrintersRepository.update(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("SQLitePrintersRepository", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("creates a printer with a generated ID and timestamps", async () => {
    const printer = await createPrinter();

    expect(typeof printer.id).toBe("string");
    expect(printer.createdAt).toBeInstanceOf(Date);
    expect(printer.updatedAt).toBeInstanceOf(Date);
  });

  test("enforces unique printer names", async () => {
    const existing = await createPrinter();
    const duplicate = await unitOfWork.execute((tx) =>
      SQLitePrintersRepository.create(
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

  test("retrieves a printer by ID", async () => {
    const created = await createPrinter();

    expect(await getPrinters({ id: [created.id] })).toEqual([created]);
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

  test("filters by partial nickname", async () => {
    const marker = crypto.randomUUID();
    const matching = await createPrinter({ nickname: `Front desk ${marker}` });
    await createPrinter({ nickname: `Back desk ${marker}` });

    expect((await getPrinters({ nickname: ["front desk"] })).map(({ id }) => id)).toEqual([matching.id]);
  });

  test("sorts and paginates matching printers", async () => {
    const marker = crypto.randomUUID();
    const names = [`printer-${marker}-c`, `printer-${marker}-a`, `printer-${marker}-b`];
    for (const name of names) await createPrinter({ name });

    const result = await getPrinters({
      name: names,
      pagination: { limit: 1, offset: 1 },
      sorting: [{ direction: "ASC", key: "name" }],
    });

    expect(result.map(({ name }) => name)).toEqual([`printer-${marker}-b`]);
  });

  test("updates printer fields", async () => {
    const printer = await createPrinter();
    const nickname = `Updated ${crypto.randomUUID()}`;
    const updated = await updatePrinters([{ id: printer.id, location: "Updated location", nickname }]);

    expect(updated).toMatchObject([{ id: printer.id, location: "Updated location", nickname }]);
  });

  test("clears a printer nickname", async () => {
    const printer = await createPrinter({ nickname: "Existing nickname" });

    expect(await updatePrinters([{ id: printer.id, nickname: null }])).toMatchObject([
      { id: printer.id, nickname: null },
    ]);
  });

  test("rejects duplicate IDs in a batch update without changing the printer", async () => {
    const printer = await createPrinter();
    const result = await unitOfWork.execute((tx) =>
      SQLitePrintersRepository.update(
        [
          { id: printer.id, name: "first update" },
          { id: printer.id, name: "duplicate update" },
        ],
        tx,
      ),
    );
    const [unchanged] = await getPrinters({ id: [printer.id] });

    expect(result.isOk).toBe(false);
    expect(unchanged).toEqual(printer);
  });

  test("deletes only the requested printer", async () => {
    const target = await createPrinter();
    const retained = await createPrinter();
    const result = await unitOfWork.execute((tx) => SQLitePrintersRepository.delete([target.id], tx));

    expect(result.isOk).toBe(true);
    expect(await getPrinters({ id: [target.id] })).toEqual([]);
    expect(await getPrinters({ id: [retained.id] })).toEqual([retained]);
  });
});
