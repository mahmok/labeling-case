import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { createDatabase } from "../db";
import type { SQLiteTransaction } from "../db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../db/unit-of-work.ts";
import { isNotFoundError } from "../utils/errors.ts";
import { ok } from "../utils/result.ts";
import type { PrintersClient } from "./client";
import { MockClient } from "./client";
import type { Printer } from "./domain.ts";
import { fromDialect } from "./repository";
import type { CreatePrinterInput, PrintersRepository } from "./repository/interface.ts";
import { createPrinterUseCases, type PrinterUseCases } from "./use-cases.ts";

let useCases: PrinterUseCases;
let repository: PrintersRepository<SQLiteTransaction>;
let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const newPrinterInput = (overrides: Partial<CreatePrinterInput> = {}): CreatePrinterInput => {
  const marker = crypto.randomUUID();
  return {
    location: `location-${marker}`,
    model: `model-${marker}`,
    name: `printer-${marker}`,
    serialNumber: `serial-${marker}`,
    ...overrides,
  };
};

const createPrinter = async (overrides: Partial<CreatePrinterInput> = {}): Promise<Printer> => {
  const result = await useCases.createPrinter([newPrinterInput(overrides)]);
  if (!result.isOk) throw result.error;
  const [printer] = result.value;
  if (!printer) throw new Error("Expected printer creation to return a row");
  return printer;
};

describe("Printer use cases", () => {
  beforeEach(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    repository = await fromDialect("sqlite");
    unitOfWork = database.uow;
    useCases = createPrinterUseCases({ client: MockClient, repository, uow: unitOfWork });
    closeDatabase = database.close;
  });

  afterEach(async () => {
    await closeDatabase();
  });

  test("createPrinter persists a batch of printers", async () => {
    const first = newPrinterInput();
    const second = newPrinterInput();
    const result = await useCases.createPrinter([first, second]);

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.map(({ name }) => name)).toEqual([first.name, second.name]);
  });

  test("getVendorPrinters returns results from the injected client", async () => {
    expect(await useCases.getVendorPrinters()).toEqual(await MockClient.get({}));
  });

  test("getPrinters returns repository matches", async () => {
    const marker = crypto.randomUUID();
    const printer = await createPrinter({ name: `North office ${marker}` });
    await createPrinter({ name: `South office ${marker}` });

    const result = await useCases.getPrinters({ name: [`North office ${marker}`] });

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.map(({ id }) => id)).toEqual([printer.id]);
  });

  test("getPrinter returns the requested printer", async () => {
    const printer = await createPrinter();
    const result = await useCases.getPrinter(printer.id);

    expect(result).toEqual({ isOk: true, value: printer });
  });

  test("getPrinter returns a not-found error for an unknown ID", async () => {
    const result = await useCases.getPrinter(`missing-${crypto.randomUUID()}`);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });

  test("updatePrinter updates multiple printers", async () => {
    const first = await createPrinter();
    const second = await createPrinter();
    const firstNickname = `first-${crypto.randomUUID()}`;
    const secondNickname = `second-${crypto.randomUUID()}`;
    const result = await useCases.updatePrinter([
      { id: first.id, nickname: firstNickname },
      { id: second.id, nickname: secondNickname },
    ]);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const updatedById = new Map(result.value.map((printer) => [printer.id, printer]));
      expect(updatedById.get(first.id)?.nickname).toBe(firstNickname);
      expect(updatedById.get(second.id)?.nickname).toBe(secondNickname);
    }
  });

  test("updatePrinter returns a not-found error if any ID is unknown", async () => {
    const printer = await createPrinter();
    const result = await useCases.updatePrinter([
      { id: printer.id, nickname: "should roll back" },
      { id: `missing-${crypto.randomUUID()}`, nickname: "unknown" },
    ]);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
    expect(await useCases.getPrinter(printer.id)).toEqual({ isOk: true, value: printer });
  });

  test("deletePrinter removes multiple printers and is safe to repeat", async () => {
    const first = await createPrinter();
    const second = await createPrinter();
    const retained = await createPrinter();
    const ids = [first.id, second.id, first.id];

    expect(await useCases.deletePrinter(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.deletePrinter(ids)).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getPrinters({ id: [first.id, second.id] })).toEqual({ isOk: true, value: [] });
    expect(await useCases.getPrinter(retained.id)).toEqual({ isOk: true, value: retained });
  });

  test("deletePrinter ignores unknown IDs in a batch", async () => {
    const printer = await createPrinter();
    const result = await useCases.deletePrinter([printer.id, `missing-${crypto.randomUUID()}`]);

    expect(result).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getPrinters({ id: [printer.id] })).toEqual({ isOk: true, value: [] });
  });

  test("applyPrinterChanges creates, updates, and deletes in one operation", async () => {
    const toUpdate = await createPrinter();
    const toDelete = await createPrinter();
    const retained = await createPrinter();
    const input = newPrinterInput();
    const updatedName = `synced-${crypto.randomUUID()}`;
    const result = await useCases.applyPrinterChanges({
      create: [input],
      delete: [toDelete.id],
      update: [{ id: toUpdate.id, name: updatedName }],
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.created.map(({ name }) => name)).toEqual([input.name]);
      expect(result.value.updated).toMatchObject([{ id: toUpdate.id, name: updatedName }]);
      expect(result.value.deleted).toEqual([toDelete]);
    }
    expect(await useCases.getPrinters({ id: [toDelete.id] })).toEqual({ isOk: true, value: [] });
    expect(await useCases.getPrinter(retained.id)).toEqual({ isOk: true, value: retained });
  });

  test("sync plans vendor changes and applies the batch", async () => {
    const unchanged = await createPrinter({ model: "Model A", name: "Unchanged" });
    const toUpdate = await createPrinter({ model: "Old model", name: "Update me" });
    const toDelete = await createPrinter({ model: "Model C", name: "Remove me" });
    const client: PrintersClient = {
      get: async () =>
        ok([
          { model: "Model A", name: "Unchanged" },
          { model: "New model", name: "Update me" },
          { model: "Model D", name: "Create me" },
        ]),
    };
    const syncUseCases = createPrinterUseCases({ client, repository, uow: unitOfWork });

    const result = await syncUseCases.sync();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.created.map(({ name }) => name)).toEqual(["Create me"]);
      expect(result.value.updated).toMatchObject([{ id: toUpdate.id, model: "New model", name: "Update me" }]);
      expect(result.value.deleted).toEqual([toDelete]);
    }
    expect(await syncUseCases.getPrinter(unchanged.id)).toEqual({ isOk: true, value: unchanged });
    expect(await syncUseCases.getPrinters({ name: ["Create me"] })).toMatchObject({
      isOk: true,
      value: [{ model: "Model D", name: "Create me" }],
    });
    expect(await syncUseCases.getPrinters({ name: [toDelete.name] })).toEqual({ isOk: true, value: [] });
  });

  test("sync leaves local printers unchanged for an empty vendor response", async () => {
    const printer = await createPrinter();
    const client: PrintersClient = { get: async () => ok([]) };
    const syncUseCases = createPrinterUseCases({ client, repository, uow: unitOfWork });

    const result = await syncUseCases.sync();

    expect(result).toEqual({ isOk: true, value: { created: [], deleted: [], updated: [] } });
    expect(await syncUseCases.getPrinter(printer.id)).toEqual({ isOk: true, value: printer });
  });

  test("sync reconciles local printers against the injected vendor client", async () => {
    const first = await useCases.sync();
    expect(first.isOk).toBe(true);
    if (!first.isOk) return;
    expect(first.value.created.length).toBeGreaterThan(0);

    const second = await useCases.sync();
    expect(second).toEqual({ isOk: true, value: { created: [], deleted: [], updated: [] } });
  });

  test("applyPrinterChanges rolls back the whole batch when an update ID is missing", async () => {
    const toDelete = await createPrinter();
    const createdInput = newPrinterInput();
    const result = await useCases.applyPrinterChanges({
      create: [createdInput],
      delete: [toDelete.id],
      update: [{ id: `missing-${crypto.randomUUID()}`, name: "missing" }],
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
    expect(await useCases.getPrinter(toDelete.id)).toEqual({ isOk: true, value: toDelete });
    expect(await useCases.getPrinters({ name: [createdInput.name] })).toEqual({ isOk: true, value: [] });
  });
});
