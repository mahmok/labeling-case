import type { UnitOfWork } from "../db/unit-of-work.ts";
import { notFoundError } from "../utils/errors.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { Printer } from "./domain.ts";
import type { GetPrintersResponse, PrintersClient } from "./client/interface.ts";
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

export type PrinterUseCases = {
  createPrinter: (input: CreatePrinterInput) => Promise<Result<Printer, Error>>;
  deletePrinter: (id: string) => Promise<Result<void, Error>>;
  getPrinter: (id: string) => Promise<Result<Printer, Error>>;
  getPrinters: (input: GetPrintersInput) => Promise<Result<Printer[], Error>>;
  getVendorPrinters: () => Promise<Result<GetPrintersResponse, Error>>;
  updatePrinter: (input: UpdatePrinterInput) => Promise<Result<Printer, Error>>;
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
  return (input: CreatePrinterInput): Promise<Result<Printer, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.create([input], tx);
      if (!result.isOk) return result;

      const [printer] = result.value;
      return printer ? ok(printer) : err(new Error("Printer repository returned no created printer"));
    });
};

export const updatePrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (input: UpdatePrinterInput): Promise<Result<Printer, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.update([input], tx);
      if (!result.isOk) return result;

      const [printer] = result.value;
      return printer ? ok(printer) : err(notFoundError("Printer", input.id));
    });
};

export const deletePrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (id: string): Promise<Result<void, Error>> =>
    uow.execute(async (tx) => {
      const existing = await repository.get({ id: [id] }, tx);
      if (!existing.isOk) return existing;
      if (existing.value.length === 0) return err(notFoundError("Printer", id));

      return repository.delete([id], tx);
    });
};

export const createPrinterUseCases = <T>(deps: Dependencies<T>): PrinterUseCases => ({
  createPrinter: createPrinter(deps),
  deletePrinter: deletePrinter(deps),
  getPrinter: getPrinter(deps),
  getPrinters: getPrinters(deps),
  getVendorPrinters: getVendorPrinters(deps.client),
  updatePrinter: updatePrinter(deps),
});
