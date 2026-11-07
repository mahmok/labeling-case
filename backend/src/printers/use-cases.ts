import type { UnitOfWork } from "../db/unit-of-work.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { Printer } from "./domain.ts";
import type {
  CreatePrinterInput,
  GetPrintersInput,
  PrintersRepository,
  UpdatePrinterInput,
} from "./repository/interface.ts";

export type Dependencies<T> = {
  uow: UnitOfWork<T>;
  repository: PrintersRepository<T>;
};

export class PrinterNotFoundError extends Error {
  constructor(id: string) {
    super(`Printer ${id} was not found`);
    this.name = "PrinterNotFoundError";
  }
}

export const getPrinters = <T>({ repository, uow }: Dependencies<T>) => {
  return (input: GetPrintersInput): Promise<Result<Printer[], Error>> => uow.execute((tx) => repository.get(input, tx));
};

export const getPrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return async (id: string): Promise<Result<Printer, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.get({ id: [id] }, tx);
      if (!result.isOk) return result;

      const [printer] = result.value;
      return printer ? ok(printer) : err(new PrinterNotFoundError(id));
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
      return printer ? ok(printer) : err(new PrinterNotFoundError(input.id));
    });
};

export const deletePrinter = <T>({ repository, uow }: Dependencies<T>) => {
  return (id: string): Promise<Result<void, Error>> =>
    uow.execute(async (tx) => {
      const existing = await repository.get({ id: [id] }, tx);
      if (!existing.isOk) return existing;
      if (existing.value.length === 0) return err(new PrinterNotFoundError(id));

      return repository.delete([id], tx);
    });
};
