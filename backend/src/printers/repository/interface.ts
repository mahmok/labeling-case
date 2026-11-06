import type { Result } from "../../utils/result.ts";
import type { Printer } from "../domain.ts";

export type CreatePrinterInput = {
  name: string;
  model: string;
  location: string;
  serialNumber: string;
};

export type UpdatePrinterInput = {
  id: string;
  name?: string;
  model?: string;
  location?: string;
  serialNumber?: string;
};

export type GetPrintersInput = {
  id?: string[];
  name?: string[];
  model?: string[];
  location?: string[];
  serialNumber?: string[];
  pagination?: {
    limit: number;
    offset: number;
  };
  sorting?: {
    key: keyof Printer;
    direction: "ASC" | "DESC";
  }[];
};

export interface PrintersRepository<T> {
  create: (input: CreatePrinterInput[], tx: T) => Promise<Result<Printer[], Error>>;
  delete: (ids: string[], tx: T) => Promise<Result<void, Error>>;
  get: (input: GetPrintersInput, tx: T) => Promise<Result<Printer[], Error>>;
  update: (input: UpdatePrinterInput[], tx: T) => Promise<Result<Printer[], Error>>;
}
