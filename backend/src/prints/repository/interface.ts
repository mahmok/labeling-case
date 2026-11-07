import type { Result } from "../../utils/result.ts";
import type { Print } from "../domain.ts";

export type CreatePrintInput = Omit<Print, "id" | "label" | "createdAt" | "updatedAt"> & { label: { id: string } };

export type UpdatePrintPrinterIdInput = { id: string; printerId: string };

export type GetPrintsInput = {
  id?: string[];
  printerId?: string[];
  printerIdIsNull?: boolean;
  triggeredBy?: string[];
  printerName?: string[];
  labelId?: string[];
  labelName?: string[];
  labelVersion?: string[];
  pagination?: { limit: number; offset: number };
  sorting?: {
    key:
      | "id"
      | "triggeredBy"
      | "printerId"
      | "printerName"
      | "labelId"
      | "labelName"
      | "labelVersion"
      | "createdAt"
      | "updatedAt";
    direction: "ASC" | "DESC";
  }[];
};

export interface PrintsRepository<T> {
  create: (input: CreatePrintInput[], tx: T) => Promise<Result<Print[], Error>>;
  delete: (ids: string[], tx: T) => Promise<Result<void, Error>>;
  get: (input: GetPrintsInput, tx: T) => Promise<Result<Print[], Error>>;
  updatePrinterIds: (input: UpdatePrintPrinterIdInput[], tx: T) => Promise<Result<Print[], Error>>;
}
