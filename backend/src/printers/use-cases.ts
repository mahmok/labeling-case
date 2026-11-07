import type { UnitOfWork } from "../db/unit-of-work.ts";
import { notFoundError } from "../utils/errors.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { GetPrintersResponse, PrintersClient } from "./client";
import type { Printer } from "./domain.ts";
import type {
  CreatePrinterInput,
  GetPrintersInput,
  PrintersRepository,
  UpdatePrinterInput,
} from "./repository/interface.ts";

export type Dependencies<T> = {
  client: PrintersClient;
  uow: UnitOfWork<T>;
  repository: PrintersRepository<T>;
};

export type ApplyPrinterChangesInput = {
  create: CreatePrinterInput[];
  update: UpdatePrinterInput[];
  delete: string[];
};

export type ApplyPrinterChangesResult = {
  created: Printer[];
  updated: Printer[];
  deleted: Printer[];
};

export type PrinterUseCases = {
  createPrinter: (inputs: CreatePrinterInput[]) => Promise<Result<Printer[], Error>>;
  deletePrinter: (ids: string[]) => Promise<Result<void, Error>>;
  getPrinter: (id: string) => Promise<Result<Printer, Error>>;
  getPrinters: (input: GetPrintersInput) => Promise<Result<Printer[], Error>>;
  getVendorPrinters: () => Promise<Result<GetPrintersResponse, Error>>;
  sync: () => Promise<Result<ApplyPrinterChangesResult, Error>>;
  applyPrinterChanges: (input: ApplyPrinterChangesInput) => Promise<Result<ApplyPrinterChangesResult, Error>>;
  updatePrinter: (inputs: UpdatePrinterInput[]) => Promise<Result<Printer[], Error>>;
};

export const getVendorPrinters = (client: PrintersClient) => (): Promise<Result<GetPrintersResponse, Error>> =>
  client.get({});

export const getPrinters = <T>({ repository, uow }: Dependencies<T>) => {
  return (input: GetPrintersInput): Promise<Result<Printer[], Error>> => uow.execute((tx) => repository.get(input, tx));
};

export const getPrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return async (id: string): Promise<Result<Printer, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.get({ id: [id] }, tx);
      if (!result.isOk) return result;

      const [printer] = result.value;
      return printer ? ok(printer) : err(notFoundError("Printer", id));
    });
};

export const createPrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (inputs: CreatePrinterInput[]): Promise<Result<Printer[], Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.create(inputs, tx);
      if (!result.isOk) return result;
      if (result.value.length !== inputs.length) {
        return err(new Error("Printer repository returned an unexpected number of created printers"));
      }
      return result;
    });
};

export const updatePrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (inputs: UpdatePrinterInput[]): Promise<Result<Printer[], Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.update(inputs, tx);
      if (!result.isOk) return result;

      const updatedIds = new Set(result.value.map(({ id }) => id));
      const missing = inputs.find(({ id }) => !updatedIds.has(id));
      return missing ? err(notFoundError("Printer", missing.id)) : result;
    });
};

export const deletePrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (ids: string[]): Promise<Result<void, Error>> => uow.execute((tx) => repository.delete([...new Set(ids)], tx));
};

const PRINTER_FETCH_PAGE_SIZE = 50;

const fetchExistingPrinters = <T>({ repository, uow }: Dependencies<T>): Promise<Result<Printer[], Error>> =>
  uow.execute(async (tx) => {
    const printers: Printer[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await repository.get(
        {
          pagination: { limit: PRINTER_FETCH_PAGE_SIZE, offset },
          sorting: [{ direction: "ASC", key: "name" }],
        },
        tx,
      );
      if (!page.isOk) return page;

      printers.push(...page.value);
      hasMore = page.value.length === PRINTER_FETCH_PAGE_SIZE;
      offset += PRINTER_FETCH_PAGE_SIZE;
    }

    return ok(printers);
  });

const printersAreEqual = (left: Printer, right: { name: string; model: string }): boolean =>
  left.name === right.name && left.model === right.model;

const planPrinterChanges = (
  vendorPrinters: GetPrintersResponse,
  existingPrinters: Printer[],
): ApplyPrinterChangesInput => {
  const vendorByName = new Map(vendorPrinters.map((printer) => [printer.name, printer]));
  const existingByName = new Map(existingPrinters.map((printer) => [printer.name, printer]));
  const create: CreatePrinterInput[] = [];
  const update: UpdatePrinterInput[] = [];
  const deleteIds: string[] = [];

  for (const [name, vendorPrinter] of vendorByName) {
    const existing = existingByName.get(name);
    if (!existing) {
      create.push({ ...vendorPrinter, location: "", nickname: "", serialNumber: "" });
    } else if (!printersAreEqual(existing, vendorPrinter)) {
      update.push({ ...vendorPrinter, id: existing.id });
    }
  }

  for (const [name, existing] of existingByName) {
    if (!vendorByName.has(name)) deleteIds.push(existing.id);
  }

  return { create, delete: deleteIds, update };
};

const applyPrinterChanges =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: ApplyPrinterChangesInput): Promise<Result<ApplyPrinterChangesResult, Error>> =>
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: It is not really complex, just a lot of steps to apply changes to printers.
    uow.execute(async (tx): Promise<Result<ApplyPrinterChangesResult, Error>> => {
      const deleteIds = [...new Set(input.delete)];
      const toDelete = deleteIds.length > 0 ? await repository.get({ id: deleteIds }, tx) : ok<Printer[]>([]);
      if (!toDelete.isOk) return toDelete;

      const deleted = await repository.delete(deleteIds, tx);
      if (!deleted.isOk) return deleted;

      const updated = await repository.update(input.update, tx);
      if (!updated.isOk) return updated;
      const updatedIds = new Set(updated.value.map(({ id }) => id));
      const missingUpdate = input.update.find(({ id }) => !updatedIds.has(id));
      if (missingUpdate) return err(notFoundError("Printer", missingUpdate.id));

      const created = await repository.create(input.create, tx);
      if (!created.isOk) return created;
      if (created.value.length !== input.create.length) {
        return err(new Error("Printer repository returned an unexpected number of created printers"));
      }

      return ok({ created: created.value, deleted: toDelete.value, updated: updated.value });
    });

const syncPrinters =
  <T>({ client, repository, uow }: Dependencies<T>) =>
  async (): Promise<Result<ApplyPrinterChangesResult, Error>> => {
    const vendorPrinters = await getVendorPrinters(client)();
    if (!vendorPrinters.isOk) return vendorPrinters;
    if (vendorPrinters.value.length === 0) return ok({ created: [], deleted: [], updated: [] });

    const existingPrinters = await fetchExistingPrinters({ client, repository, uow });
    if (!existingPrinters.isOk) return existingPrinters;

    const changes = planPrinterChanges(vendorPrinters.value, existingPrinters.value);
    return applyPrinterChanges({ client, repository, uow })(changes);
  };

export const createPrinterUseCases = <T>(deps: Dependencies<T>): PrinterUseCases => ({
  applyPrinterChanges: applyPrinterChanges(deps),
  createPrinter: createPrinter(deps),
  deletePrinter: deletePrinter(deps),
  getPrinter: getPrinter(deps),
  getPrinters: getPrinters(deps),
  getVendorPrinters: getVendorPrinters(deps.client),
  sync: syncPrinters(deps),
  updatePrinter: updatePrinter(deps),
});
