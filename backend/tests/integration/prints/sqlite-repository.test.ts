import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { SQLiteTransaction } from "../../../src/db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import { SQLiteLabelsRepository } from "../../../src/labels/repository/sqlite.ts";
import type { Print } from "../../../src/prints/domain.ts";
import type { CreatePrintInput, GetPrintsInput } from "../../../src/prints/repository/interface.ts";
import { SQLitePrintsRepository } from "../../../src/prints/repository/sqlite.ts";

let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const createPrint = async (overrides: Partial<CreatePrintInput> = {}): Promise<Print> => {
  const marker = crypto.randomUUID();
  const input: CreatePrintInput = {
    label: { id: `label-${marker}` },
    printer: { id: null, name: `printer-${marker}` },
    triggeredBy: `user-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => SQLitePrintsRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const print = result.value[0];
  if (!print) throw new Error("Expected print creation to return a row");
  return print;
};

const createLabel = async (id: string, name: string, version: string): Promise<void> => {
  const result = await unitOfWork.execute((tx) =>
    SQLiteLabelsRepository.create([{ id, isPrimary: false, name, version }], tx),
  );
  if (!result.isOk) throw result.error;
};

const getPrints = async (input: GetPrintsInput): Promise<Print[]> => {
  const result = await unitOfWork.execute((tx) => SQLitePrintsRepository.get(input, tx));
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("SQLitePrintsRepository", () => {
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

  test("persists the provided printer ID and vendor name without lookup", async () => {
    await createLabel("shipping-v2", "Shipping label", "2");
    const printer = { id: crypto.randomUUID(), name: "Shipping printer" };
    const input: CreatePrintInput = {
      label: { id: "shipping-v2" },
      printer,
      triggeredBy: "api",
    };

    const print = await createPrint(input);

    expect(print).toMatchObject({ ...input });
    expect(print.createdAt).toBeInstanceOf(Date);
    expect(print.updatedAt).toBeInstanceOf(Date);
    expect(await getPrints({ id: [print.id] })).toEqual([print]);
  });

  test("persists a null printer ID without resolving it from the cache", async () => {
    const printerName = `Cached printer ${crypto.randomUUID()}`;
    const print = await createPrint({ printer: { id: null, name: printerName } });

    expect(print.printer).toEqual({ id: null, name: printerName });
    expect(await getPrints({ id: [print.id] })).toEqual([print]);
  });

  test("filters, sorts, and paginates print records using domain data", async () => {
    const marker = crypto.randomUUID();
    const labelId = `label-${marker}`;
    const printerName = `Shipping printer ${marker}`;
    await createLabel(labelId, `Shipping ${marker}`, "v1");
    const matching = await createPrint({
      label: { id: labelId },
      printer: { id: null, name: printerName },
      triggeredBy: `api-${marker}`,
    });
    await createPrint({
      label: { id: `other-label-${marker}` },
      printer: { id: null, name: `other-printer-${marker}` },
      triggeredBy: `other-${marker}`,
    });

    expect(
      await getPrints({
        labelName: [marker.slice(0, 8)],
        pagination: { limit: 1, offset: 0 },
        printerName: [printerName],
        sorting: [{ direction: "ASC", key: "id" }],
        triggeredBy: [matching.triggeredBy],
      }),
    ).toEqual([matching]);
  });

  test("deletes only requested print records", async () => {
    const target = await createPrint();
    const retained = await createPrint();

    const deleted = await unitOfWork.execute((tx) => SQLitePrintsRepository.delete([target.id], tx));

    expect(deleted).toEqual({ isOk: true, value: undefined });
    expect(await getPrints({ id: [target.id, retained.id] })).toEqual([retained]);
  });
});
