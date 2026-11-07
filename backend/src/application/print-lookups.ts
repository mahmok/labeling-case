import type { LabelUseCases } from "../labels";
import type { PrinterUseCases } from "../printers";
import type { Label as PrintLabel, Printer as PrintPrinter } from "../prints/domain.ts";
import type { GetLabelById, GetPrinterByName } from "../prints/use-cases.ts";
import { notFoundError } from "../utils/errors.ts";
import { err, ok, type Result } from "../utils/result.ts";

export type PrintLookupMethods = {
  getLabelByIdFromVendor: GetLabelById;
  getLabelByIdLocally: GetLabelById;
  getPrinterByNameFromVendor: GetPrinterByName;
  getPrinterByNameLocally: GetPrinterByName;
};

type LookupUseCases = {
  labels: Pick<LabelUseCases, "getLabel" | "getVendorLabels">;
  printers: Pick<PrinterUseCases, "getPrinters" | "getVendorPrinters">;
};

export const createPrintLookupMethods = ({ labels, printers }: LookupUseCases): PrintLookupMethods => ({
  getLabelByIdFromVendor: async (id: string): Promise<Result<PrintLabel, Error>> => {
    const result = await labels.getVendorLabels();
    if (!result.isOk) return result;
    const label = result.value.find((candidate) => candidate.id === id);
    return label
      ? ok({ id: label.id, name: label.name, version: String(label.version) })
      : err(notFoundError("Label", id));
  },
  getLabelByIdLocally: async (id: string): Promise<Result<PrintLabel, Error>> => {
    const result = await labels.getLabel(id);
    return result.isOk ? ok({ id: result.value.id, name: result.value.name, version: result.value.version }) : result;
  },
  getPrinterByNameFromVendor: async (name: string): Promise<Result<PrintPrinter, Error>> => {
    const result = await printers.getVendorPrinters();
    if (!result.isOk) return result;
    const printer = result.value.find((candidate) => candidate.name === name);
    return printer ? ok({ id: null, name: printer.name }) : err(notFoundError("Printer", name));
  },
  getPrinterByNameLocally: async (name: string): Promise<Result<PrintPrinter, Error>> => {
    const result = await printers.getPrinters({ name: [name] });
    if (!result.isOk) return result;
    const printer = result.value[0];
    return printer ? ok({ id: printer.id, name: printer.name }) : err(notFoundError("Printer", name));
  },
});
