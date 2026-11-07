import { and, asc, desc, inArray, like, or, type SQL } from "drizzle-orm";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Printer } from "../domain.ts";
import { printersTable } from "../schema/sqlite.ts";
import type { CreatePrinterInput, GetPrintersInput, PrintersRepository, UpdatePrinterInput } from "./interface.ts";

export const SQLitePrintersRepository: PrintersRepository<SQLiteTransaction> = {
  async create(input: CreatePrinterInput[], tx: SQLiteTransaction): Promise<Result<Printer[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      return ok(await tx.insert(printersTable).values(input).returning());
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: SQLiteTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) await tx.delete(printersTable).where(inArray(printersTable.id, ids));
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetPrintersInput, tx: SQLiteTransaction): Promise<Result<Printer[], Error>> {
    try {
      const filters: SQL[] = [
        ...(input.id?.length ? [inArray(printersTable.id, input.id)] : []),
        ...(input.model?.length ? [inArray(printersTable.model, input.model)] : []),
        ...(input.location?.length ? [inArray(printersTable.location, input.location)] : []),
        ...(input.serialNumber?.length ? [inArray(printersTable.serialNumber, input.serialNumber)] : []),
      ];

      if (input.name?.length) {
        const nameFilter = or(...input.name.map((name) => like(printersTable.name, `%${name}%`)));
        if (nameFilter) filters.push(nameFilter);
      }
      if (input.nickname?.length) {
        const nicknameFilter = or(...input.nickname.map((nickname) => like(printersTable.nickname, `%${nickname}%`)));
        if (nicknameFilter) filters.push(nicknameFilter);
      }

      let query = tx.select().from(printersTable).$dynamic();
      if (filters.length) query = query.where(and(...filters));
      if (input.sorting?.length) {
        query = query.orderBy(
          ...input.sorting.map(({ key, direction }) =>
            direction === "ASC" ? asc(printersTable[key]) : desc(printersTable[key]),
          ),
        );
      }
      if (input.pagination) query = query.limit(input.pagination.limit).offset(input.pagination.offset);
      return ok(await query);
    } catch (error) {
      return err(asError(error));
    }
  },

  async update(input: UpdatePrinterInput[], tx: SQLiteTransaction): Promise<Result<Printer[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const ids = input.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) return err(new Error("Duplicate printer IDs"));

      const fields = ["name", "model", "nickname", "location", "serialNumber"] as const;
      const updated: Printer[] = [];
      for (const item of input) {
        const changes = Object.fromEntries(fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));
        if (Object.keys(changes).length === 0) continue;
        updated.push(...(await tx.update(printersTable).set(changes).where(inArray(printersTable.id, [item.id])).returning()));
      }
      return ok(updated);
    } catch (error) {
      return err(asError(error));
    }
  },
};
