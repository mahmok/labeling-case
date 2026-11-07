import { and, asc, desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import { labelsTable } from "../../labels/schema/sqlite.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Print } from "../domain.ts";
import { printsTable } from "../schema/sqlite.ts";
import type { CreatePrintInput, GetPrintsInput, PrintsRepository } from "./interface.ts";

const sortableColumns = {
  id: printsTable.id,
  labelId: printsTable.labelId,
  labelName: labelsTable.name,
  labelVersion: labelsTable.version,
  printerName: printsTable.printerName,
  triggeredBy: printsTable.triggeredBy,
} as const;

type PrintRow = {
  id: string;
  triggeredBy: string;
  printerId: string | null;
  printerName: string;
  labelId: string;
  labelName: string | null;
  labelVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const toPrint = (row: PrintRow): Print => ({
  createdAt: row.createdAt,
  id: row.id,
  label: { id: row.labelId, name: row.labelName, version: row.labelVersion },
  printer: { id: row.printerId, name: row.printerName },
  triggeredBy: row.triggeredBy,
  updatedAt: row.updatedAt,
});

const selectPrints = async (tx: SQLiteTransaction, input: GetPrintsInput): Promise<PrintRow[]> => {
  const filters: SQL[] = [
    ...(input.id?.length ? [inArray(printsTable.id, input.id)] : []),
    ...(input.triggeredBy?.length ? [inArray(printsTable.triggeredBy, input.triggeredBy)] : []),
    ...(input.printerName?.length ? [inArray(printsTable.printerName, input.printerName)] : []),
    ...(input.labelId?.length ? [inArray(printsTable.labelId, input.labelId)] : []),
    ...(input.labelVersion?.length ? [inArray(labelsTable.version, input.labelVersion)] : []),
  ];

  if (input.labelName?.length) {
    const labelNameFilter = or(...input.labelName.map((value) => like(labelsTable.name, `%${value}%`)));
    if (labelNameFilter) filters.push(labelNameFilter);
  }

  let query = tx
    .select({
      createdAt: printsTable.createdAt,
      id: printsTable.id,
      labelId: printsTable.labelId,
      labelName: labelsTable.name,
      labelVersion: labelsTable.version,
      printerId: printsTable.printerId,
      printerName: printsTable.printerName,
      triggeredBy: printsTable.triggeredBy,
      updatedAt: printsTable.updatedAt,
    })
    .from(printsTable)
    .leftJoin(labelsTable, eq(printsTable.labelId, labelsTable.id))
    .$dynamic();

  if (filters.length > 0) query = query.where(and(...filters));
  if (input.sorting?.length) {
    query = query.orderBy(
      ...input.sorting.map(({ key, direction }) =>
        direction === "ASC" ? asc(sortableColumns[key]) : desc(sortableColumns[key]),
      ),
    );
  }
  if (input.pagination) query = query.limit(input.pagination.limit).offset(input.pagination.offset);
  return query;
};

export const SQLitePrintsRepository: PrintsRepository<SQLiteTransaction> = {
  async create(input: CreatePrintInput[], tx: SQLiteTransaction): Promise<Result<Print[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const inserted = await tx
        .insert(printsTable)
        .values(
          input.map(({ label, printer, triggeredBy }) => ({
            labelId: label.id,
            printerId: printer.id,
            printerName: printer.name,
            triggeredBy,
          })),
        )
        .returning({ id: printsTable.id });
      const ids = inserted.map(({ id }) => id);
      const rows = await selectPrints(tx, { id: ids });
      const printsById = new Map(rows.map((row) => [row.id, toPrint(row)]));
      return ok(
        ids.flatMap((id) => {
          const print = printsById.get(id);
          return print ? [print] : [];
        }),
      );
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: SQLiteTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) await tx.delete(printsTable).where(inArray(printsTable.id, ids));
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetPrintsInput, tx: SQLiteTransaction): Promise<Result<Print[], Error>> {
    try {
      return ok((await selectPrints(tx, input)).map(toPrint));
    } catch (error) {
      return err(asError(error));
    }
  },
};
