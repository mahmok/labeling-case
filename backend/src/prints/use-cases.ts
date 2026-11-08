import type { UnitOfWork } from "../db/unit-of-work.ts";
import { isNotFoundError, notFoundError } from "../utils/errors.ts";
import { err, ok, type Result } from "../utils/result.ts";
import type { PrintClient } from "./client";
import type { Label, Print, Printer } from "./domain.ts";
import type { GetPrintsInput, PrintsRepository, UpdatePrintPrinterIdInput } from "./repository/interface.ts";

export type GetPrinterByName = (name: string) => Promise<Result<Printer, Error>>;
export type GetLabelById = (id: string) => Promise<Result<Label, Error>>;

export type Dependencies<T> = {
  client: PrintClient;
  uow: UnitOfWork<T>;
  repository: PrintsRepository<T>;
  getPrinterByNameLocally: GetPrinterByName;
  getLabelByIdLocally: GetLabelById;
  getPrinterByNameFromVendor: GetPrinterByName;
  getLabelByIdFromVendor: GetLabelById;
};

type PrinterLookupPolicy = "required" | "optional";

export type PrintInput = {
  labelId: string;
  printerName: string;
  triggeredBy: string;
};

export type PrintsUseCases = {
  printWithLocalLookup: (input: PrintInput) => Promise<Result<Print, Error>>;
  printWithVendorLookup: (input: PrintInput) => Promise<Result<Print, Error>>;
  backfillPrints: () => Promise<Result<Print[], Error>>;
  getPrint: (id: string) => Promise<Result<Print, Error>>;
  getPrints: (input: GetPrintsInput) => Promise<Result<Print[], Error>>;
};

const lookupPrinterAndLabel = async (
  input: PrintInput,
  getPrinterByName: GetPrinterByName,
  getLabelById: GetLabelById,
  printerLookupPolicy: PrinterLookupPolicy,
): Promise<Result<{ printer: Printer; label: Label }, Error>> => {
  const [labelResult, printerResult] = await Promise.all([
    getLabelById(input.labelId),
    getPrinterByName(input.printerName),
  ]);
  if (!labelResult.isOk) return labelResult;

  if (!printerResult.isOk) {
    if (!(isNotFoundError(printerResult.error) && printerLookupPolicy === "optional")) return printerResult;
    return ok({ label: labelResult.value, printer: { id: null, name: input.printerName } });
  }

  return ok({ label: labelResult.value, printer: printerResult.value });
};

const sendToVendor = async (client: PrintClient, input: PrintInput): Promise<Result<void, Error>> => {
  const result = await client.print({ labelId: input.labelId, printerName: input.printerName });
  return result.isOk ? ok() : result;
};

const printWithLocalLookup =
  <T>({ client, repository, uow, getPrinterByNameLocally, getLabelByIdLocally }: Dependencies<T>) =>
  async (input: PrintInput): Promise<Result<Print, Error>> => {
    const printerAndLabel = await lookupPrinterAndLabel(
      input,
      getPrinterByNameLocally,
      getLabelByIdLocally,
      "required",
    );
    if (!printerAndLabel.isOk) return printerAndLabel;

    const sent = await sendToVendor(client, input);
    if (!sent.isOk) return sent;

    const { printer } = printerAndLabel.value;
    const result = await uow.execute((tx) =>
      repository.create(
        [
          {
            label: { id: input.labelId },
            printer: { id: printer.id, name: input.printerName },
            triggeredBy: input.triggeredBy,
          },
        ],
        tx,
      ),
    );

    if (!result.isOk) return result;
    return result.value[0]
      ? ok(result.value[0])
      : err(new Error("Print repository returned an unexpected number of created prints"));
  };

const printWithVendorLookup =
  <T>({ client, repository, uow, getPrinterByNameFromVendor, getLabelByIdFromVendor }: Dependencies<T>) =>
  async (input: PrintInput): Promise<Result<Print, Error>> => {
    const printerAndLabel = await lookupPrinterAndLabel(
      input,
      getPrinterByNameFromVendor,
      getLabelByIdFromVendor,
      "optional",
    );
    if (!printerAndLabel.isOk) return printerAndLabel;

    const sent = await sendToVendor(client, input);
    if (!sent.isOk) return sent;

    const result = await uow.execute((tx) =>
      repository.create(
        [
          {
            label: { id: input.labelId },
            printer: { id: null, name: input.printerName },
            triggeredBy: input.triggeredBy,
          },
        ],
        tx,
      ),
    );

    if (!result.isOk) return result;
    return result.value[0]
      ? ok(result.value[0])
      : err(new Error("Print repository returned an unexpected number of created prints"));
  };

const getPrints =
  <T>({ repository, uow }: Dependencies<T>) =>
  (input: GetPrintsInput): Promise<Result<Print[], Error>> =>
    uow.execute((tx) => repository.get(input, tx));

const getPrint =
  <T>({ repository, uow }: Dependencies<T>) =>
  async (id: string): Promise<Result<Print, Error>> =>
    uow.execute(async (tx) => {
      const result = await repository.get({ id: [id] }, tx);
      if (!result.isOk) return result;
      const [print] = result.value;
      return print ? ok(print) : err(notFoundError("Print", id));
    });

const PRINT_FETCH_PAGE_SIZE = 50;

const fetchPrintsWithoutPrinterId = <T>({
  repository,
  uow,
}: Pick<Dependencies<T>, "repository" | "uow">): Promise<Result<Print[], Error>> =>
  uow.execute(async (tx) => {
    const prints: Print[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await repository.get(
        {
          pagination: { limit: PRINT_FETCH_PAGE_SIZE, offset },
          printerIdIsNull: true,
          sorting: [{ direction: "ASC", key: "id" }],
        },
        tx,
      );
      if (!page.isOk) return page;

      prints.push(...page.value);
      hasMore = page.value.length === PRINT_FETCH_PAGE_SIZE;
      offset += PRINT_FETCH_PAGE_SIZE;
    }

    return ok(prints);
  });

const lookupPrintersByName = async (
  names: string[],
  getPrinterByName: GetPrinterByName,
): Promise<Result<Map<string, string>, Error>> => {
  const lookups = await Promise.all(names.map(async (name) => [name, await getPrinterByName(name)] as const));
  const printerIds = new Map<string, string>();

  for (const [name, result] of lookups) {
    if (!result.isOk) {
      if (isNotFoundError(result.error)) continue;
      return result;
    }
    if (result.value.id !== null) printerIds.set(name, result.value.id);
  }

  return ok(printerIds);
};

const backfillPrints =
  <T>({ repository, uow, getPrinterByNameLocally }: Dependencies<T>) =>
  async (): Promise<Result<Print[], Error>> => {
    const unresolved = await fetchPrintsWithoutPrinterId({ repository, uow });
    if (!unresolved.isOk) return unresolved;

    const printerNames = [...new Set(unresolved.value.map(({ printer }) => printer.name))];
    const printerIds = await lookupPrintersByName(printerNames, getPrinterByNameLocally);
    if (!printerIds.isOk) return printerIds;

    const updates: UpdatePrintPrinterIdInput[] = unresolved.value.flatMap(({ id, printer }) => {
      const printerId = printerIds.value.get(printer.name);
      return printerId ? [{ id, printerId }] : [];
    });
    if (updates.length === 0) return ok([]);

    return uow.execute((tx) => repository.updatePrinterIds(updates, tx));
  };

export const createPrintsUseCases = <T>(deps: Dependencies<T>): PrintsUseCases => ({
  backfillPrints: backfillPrints(deps),
  getPrint: getPrint(deps),
  getPrints: getPrints(deps),
  printWithLocalLookup: printWithLocalLookup(deps),
  printWithVendorLookup: printWithVendorLookup(deps),
});
