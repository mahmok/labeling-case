import { and, asc, desc, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Printer } from "../domain.ts";
import { printersTable } from "../schema/postgres.ts";
import type { CreatePrinterInput, GetPrintersInput, PrintersRepository, UpdatePrinterInput } from "./interface.ts";

const buildCase = <K extends keyof UpdatePrinterInput>(field: K, input: UpdatePrinterInput[]): SQL => {
  const cases = input
    .filter((item) => item[field] !== undefined)
    .map((item) => sql`WHEN ${printersTable.id} = ${item.id} THEN ${item[field]}`);

  return sql`CASE ${sql.join(cases, sql` `)} ELSE ${printersTable[field]} END`;
};

export const PostgresPrintersRepository: PrintersRepository<PostgresTransaction> = {
  async create(input: CreatePrinterInput[], tx: PostgresTransaction): Promise<Result<Printer[], Error>> {
    try {
      if (input.length === 0) return ok([]);

      const printers = await tx.insert(printersTable).values(input).returning();

      return ok(printers);
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: PostgresTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) {
        await tx.delete(printersTable).where(inArray(printersTable.id, ids));
      }
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetPrintersInput, tx: PostgresTransaction): Promise<Result<Printer[], Error>> {
    try {
      const filters: SQL[] = [
        ...(input.id?.length ? [inArray(printersTable.id, input.id)] : []),
        ...(input.model?.length ? [inArray(printersTable.model, input.model)] : []),
        ...(input.location?.length ? [inArray(printersTable.location, input.location)] : []),
        ...(input.serialNumber?.length ? [inArray(printersTable.serialNumber, input.serialNumber)] : []),
      ];

      if (input.name?.length) {
        const nameFilter = or(...input.name.map((name) => ilike(printersTable.name, `%${name}%`)));

        if (nameFilter) filters.push(nameFilter);
      }

      if (input.nickname?.length) {
        const nicknameFilter = or(...input.nickname.map((nickname) => ilike(printersTable.nickname, `%${nickname}%`)));

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

      if (input.pagination) {
        query = query.limit(input.pagination.limit).offset(input.pagination.offset);
      }

      return ok(await query);
    } catch (error) {
      return err(asError(error));
    }
  },

  async update(input: UpdatePrinterInput[], tx: PostgresTransaction): Promise<Result<Printer[], Error>> {
    try {
      if (input.length === 0) return ok([]);

      const ids = input.map(({ id }) => id);

      if (new Set(ids).size !== ids.length) {
        return err(new Error("Duplicate printer IDs"));
      }

      const fields = ["name", "model", "nickname", "location", "serialNumber"] as const;

      const updates = Object.fromEntries(
        fields
          .filter((field) => input.some((item) => item[field] !== undefined))
          .map((field) => [field, buildCase(field, input)]),
      );

      if (Object.keys(updates).length === 0) return ok([]);

      const printers = await tx.update(printersTable).set(updates).where(inArray(printersTable.id, ids)).returning();

      return ok(printers);
    } catch (error) {
      return err(asError(error));
    }
  },
};
