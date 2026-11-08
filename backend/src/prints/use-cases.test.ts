import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { config } from "../config.ts";
import { createDatabase } from "../db";
import type { SQLiteTransaction } from "../db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../db/unit-of-work.ts";
import { SQLiteLabelsRepository } from "../labels/repository/sqlite.ts";
import { SQLitePrintersRepository } from "../printers/repository/sqlite.ts";
import { isNotFoundError, notFoundError } from "../utils/errors.ts";
import { err, ok } from "../utils/result.ts";
import { MockClient, type PrintRequest } from "./client";
import type { Label, Print, Printer } from "./domain.ts";
import type { CreatePrintInput } from "./repository/interface.ts";
import { SQLitePrintsRepository } from "./repository/sqlite.ts";
import { createPrintsUseCases, type GetLabelById, type GetPrinterByName, type PrintsUseCases } from "./use-cases.ts";

let useCases: PrintsUseCases;
let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};
const localPrinters = new Map<string, Printer>();
const localLabels = new Map<string, Label>();

const createLabel = async (overrides: Partial<{ id: string; name: string; version: string }> = {}): Promise<Label> => {
  const marker = crypto.randomUUID();
  const input = {
    id: `label-${marker}`,
    isPrimary: false,
    name: `Label ${marker}`,
    version: "v1",
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => SQLiteLabelsRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const label = result.value[0];
  if (!label) throw new Error("Expected label creation to return a row");
  const domainLabel = { id: label.id, name: label.name, version: label.version };
  localLabels.set(label.id, domainLabel);
  return domainLabel;
};

const createPrinter = async (name = `Printer ${crypto.randomUUID()}`): Promise<Printer> => {
  const result = await unitOfWork.execute((tx) =>
    SQLitePrintersRepository.create([{ location: "", model: "model", name, serialNumber: "" }], tx),
  );
  if (!result.isOk) throw result.error;
  const printer = result.value[0];
  if (!printer) throw new Error("Expected printer creation to return a row");
  const domainPrinter = { id: printer.id, name: printer.name };
  localPrinters.set(name, domainPrinter);
  return domainPrinter;
};

const getLocalPrinter: GetPrinterByName = async (name: string) => {
  const printer = localPrinters.get(name);
  return printer ? ok(printer) : err(notFoundError("Printer", name));
};

const getLocalLabel: GetLabelById = async (id: string) => {
  const label = localLabels.get(id);
  return label ? ok(label) : err(notFoundError("Label", id));
};

const createPrint = async (overrides: Partial<CreatePrintInput> = {}): Promise<Print> => {
  const marker = crypto.randomUUID();
  const input = {
    label: { id: `missing-label-${marker}` },
    printer: { id: null, name: `Vendor printer ${marker}` },
    triggeredBy: `api-${marker}`,
    ...overrides,
  };
  const result = await unitOfWork.execute((tx) => SQLitePrintsRepository.create([input], tx));
  if (!result.isOk) throw result.error;
  const print = result.value[0];
  if (!print) throw new Error("Expected print creation to return a row");
  return print;
};

describe("Print use cases", () => {
  beforeEach(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
    localPrinters.clear();
    localLabels.clear();

    useCases = createPrintsUseCases({
      client: MockClient,
      getLabelByIdFromVendor: getLocalLabel,
      getLabelByIdLocally: getLocalLabel,
      getPrinterByNameFromVendor: getLocalPrinter,
      getPrinterByNameLocally: getLocalPrinter,
      repository: SQLitePrintsRepository,
      uow: unitOfWork,
    });
  });

  afterEach(async () => {
    await closeDatabase();
  });

  test("prioritizes the required label not-found error when both lookups fail", async () => {
    let printerLookupCalled = false;
    useCases = createPrintsUseCases({
      client: MockClient,
      getLabelByIdFromVendor: async (id: string) => err(notFoundError("Label", id)),
      getLabelByIdLocally: async (id: string) => err(notFoundError("Label", id)),
      getPrinterByNameFromVendor: async (name: string) => {
        printerLookupCalled = true;
        return err(notFoundError("Printer", name));
      },
      getPrinterByNameLocally: async (name: string) => {
        printerLookupCalled = true;
        return err(notFoundError("Printer", name));
      },
      repository: SQLitePrintsRepository,
      uow: unitOfWork,
    });

    const result = await useCases.printWithLocalLookup({
      labelId: "missing-label",
      printerName: "missing-printer",
      triggeredBy: "api",
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(isNotFoundError(result.error)).toBe(true);
      if (isNotFoundError(result.error)) expect(result.error.resource).toBe("Label");
    }
    expect(printerLookupCalled).toBe(true);
  });

  test("printWithLocalLookup stores the found printer and required label", async () => {
    const label = await createLabel();
    const printer = await createPrinter();

    const result = await useCases.printWithLocalLookup({
      labelId: label.id,
      printerName: printer.name,
      triggeredBy: "api",
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.label).toMatchObject(label);
      expect(result.value.printer).toEqual(printer);
    }
  });

  test("printWithLocalLookup reports a missing printer so callers can fall back", async () => {
    const label = await createLabel();
    const printerName = `Not cached ${crypto.randomUUID()}`;

    const result = await useCases.printWithLocalLookup({
      labelId: label.id,
      printerName,
      triggeredBy: "api",
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk && isNotFoundError(result.error)) expect(result.error.resource).toBe("Printer");
  });

  test("printWithVendorLookup stores a vendor printer that is not cached locally", async () => {
    const label = await createLabel();
    const printerName = `Vendor printer ${crypto.randomUUID()}`;
    useCases = createPrintsUseCases({
      client: MockClient,
      getLabelByIdFromVendor: getLocalLabel,
      getLabelByIdLocally: getLocalLabel,
      getPrinterByNameFromVendor: async (name: string) => ok({ id: null, name }),
      getPrinterByNameLocally: getLocalPrinter,
      repository: SQLitePrintsRepository,
      uow: unitOfWork,
    });

    const result = await useCases.printWithVendorLookup({ labelId: label.id, printerName, triggeredBy: "api" });

    expect(result).toMatchObject({
      isOk: true,
      value: { label: { id: label.id }, printer: { id: null, name: printerName } },
    });
  });

  test("printWithVendorLookup rejects a printer the vendor does not know and records nothing", async () => {
    const label = await createLabel();
    const printerName = `Unknown printer ${crypto.randomUUID()}`;

    const result = await useCases.printWithVendorLookup({ labelId: label.id, printerName, triggeredBy: "api" });

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(isNotFoundError(result.error)).toBe(true);
      if (isNotFoundError(result.error)) expect(result.error.resource).toBe("Printer");
    }
    expect(await useCases.getPrints({ printerName: [printerName] })).toEqual({ isOk: true, value: [] });
  });

  test("print use cases send the request to the vendor client", async () => {
    const label = await createLabel();
    const printer = await createPrinter();
    const requests: unknown[] = [];
    useCases = createPrintsUseCases({
      client: {
        print: async (request: PrintRequest) => {
          requests.push(request);
          return ok({});
        },
      },
      getLabelByIdFromVendor: getLocalLabel,
      getLabelByIdLocally: getLocalLabel,
      getPrinterByNameFromVendor: getLocalPrinter,
      getPrinterByNameLocally: getLocalPrinter,
      repository: SQLitePrintsRepository,
      uow: unitOfWork,
    });
    const input = { labelId: label.id, printerName: printer.name, triggeredBy: "api" };

    await useCases.printWithLocalLookup(input);
    await useCases.printWithVendorLookup(input);

    expect(requests).toEqual([
      { labelId: label.id, printerName: printer.name },
      { labelId: label.id, printerName: printer.name },
    ]);
  });

  test("a vendor print failure is returned and no print is recorded", async () => {
    const label = await createLabel();
    const printer = await createPrinter();
    useCases = createPrintsUseCases({
      client: { print: async () => err(new Error("vendor unavailable")) },
      getLabelByIdFromVendor: getLocalLabel,
      getLabelByIdLocally: getLocalLabel,
      getPrinterByNameFromVendor: getLocalPrinter,
      getPrinterByNameLocally: getLocalPrinter,
      repository: SQLitePrintsRepository,
      uow: unitOfWork,
    });
    const input = { labelId: label.id, printerName: printer.name, triggeredBy: "api" };

    for (const result of [await useCases.printWithLocalLookup(input), await useCases.printWithVendorLookup(input)]) {
      expect(result.isOk).toBe(false);
      if (!result.isOk) expect(result.error.message).toBe("vendor unavailable");
    }
    expect(await useCases.getPrints({ labelId: [label.id] })).toEqual({ isOk: true, value: [] });
  });

  test("getPrints filters and sorts records, and getPrint gets one by ID", async () => {
    const label = await createLabel();
    const matching = await createPrint({
      label,
      printer: { id: null, name: "Shipping printer" },
      triggeredBy: "api",
    });
    await createPrint({
      label: { id: label.id },
      printer: { id: null, name: "Returns printer" },
      triggeredBy: "cron",
    });

    expect(
      await useCases.getPrints({
        printerName: ["Shipping printer"],
        sorting: [{ direction: "DESC", key: "createdAt" }],
      }),
    ).toEqual({ isOk: true, value: [matching] });
    expect(await useCases.getPrint(matching.id)).toEqual({ isOk: true, value: matching });
  });

  test("getPrint returns a not-found error for an unknown ID", async () => {
    const result = await useCases.getPrint(crypto.randomUUID());

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(isNotFoundError(result.error)).toBe(true);
  });

  test("backfillPrints fills IDs for cached printers and leaves unknown names unresolved", async () => {
    const label = await createLabel();
    const printer = await createPrinter("Cached printer");
    const matched = await createPrint({
      label: { id: label.id },
      printer: { id: null, name: printer.name },
    });
    const unmatched = await createPrint({
      label: { id: label.id },
      printer: { id: null, name: "Not cached" },
    });

    const result = await useCases.backfillPrints();

    expect(result).toEqual({
      isOk: true,
      value: [expect.objectContaining({ id: matched.id, printer: printer })],
    });
    expect(await useCases.getPrint(matched.id)).toMatchObject({ isOk: true, value: { printer } });
    expect(await useCases.getPrint(unmatched.id)).toMatchObject({
      isOk: true,
      value: { printer: { id: null, name: "Not cached" } },
    });
  });
});
