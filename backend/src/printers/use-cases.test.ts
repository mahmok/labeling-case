import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { isNotFoundError } from "../utils/errors.ts";
import { createDatabase } from "../db";
import type { Printer } from "./domain.ts";
import { fromDialect } from "./repository";
import type { CreatePrinterInput } from "./repository/interface.ts";
import { createPrinterUseCases, type PrinterUseCases } from "./use-cases.ts";

let useCases: PrinterUseCases;
let closeDatabase: () => Promise<void> = async () => {};

const createPrinter = async (overrides: Partial<CreatePrinterInput> = {}): Promise<Printer> => {
  const marker = crypto.randomUUID();
  const result = await useCases.createPrinter({
    location: `location-${marker}`,
    model: `model-${marker}`,
    name: `printer-${marker}`,
    serialNumber: `serial-${marker}`,
    ...overrides,
  });
  if (!result.isOk) throw result.error;
  return result.value;
};

describe("Printer use cases", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    const repository = await fromDialect("sqlite");
    useCases = createPrinterUseCases({ repository, uow: database.uow });
    closeDatabase = database.close;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test("createPrinter persists a printer", async () => {
    const marker = crypto.randomUUID();
    const result = await useCases.createPrinter({
      location: `location-${marker}`,
      model: `model-${marker}`,
      name: `printer-${marker}`,
      serialNumber: `serial-${marker}`,
    });

    expect(result.isOk).toBe(true);
    if (result.isOk)
      expect(result.value).toMatchObject({ name: `printer-${marker}`, serialNumber: `serial-${marker}` });
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

  test("updatePrinter persists mutable fields", async () => {
    const printer = await createPrinter();
    const nickname = `updated-${crypto.randomUUID()}`;
    const result = await useCases.updatePrinter({ id: printer.id, nickname });

    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value).toMatchObject({ id: printer.id, nickname });
  });

  test("updatePrinter returns a not-found error for an unknown ID", async () => {
    const result = await useCases.updatePrinter({ id: `missing-${crypto.randomUUID()}`, nickname: "unknown" });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });

  test("deletePrinter removes the printer", async () => {
    const printer = await createPrinter();
    const deleted = await useCases.deletePrinter(printer.id);

    expect(deleted).toEqual({ isOk: true, value: undefined });
    expect(await useCases.getPrinters({ id: [printer.id] })).toEqual({ isOk: true, value: [] });
  });

  test("deletePrinter returns a not-found error for an unknown ID", async () => {
    const result = await useCases.deletePrinter(`missing-${crypto.randomUUID()}`);

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });
});
