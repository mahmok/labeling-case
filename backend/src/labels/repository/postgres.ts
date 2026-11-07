import { and, asc, desc, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Label } from "../domain.ts";
import { labelsTable } from "../schema/postgres.ts";
import type { CreateLabelInput, GetLabelsInput, LabelsRepository, UpdateLabelInput } from "./interface.ts";

const buildCase = <K extends keyof UpdateLabelInput>(field: K, input: UpdateLabelInput[]): SQL => {
  const cases = input
    .filter((item) => item[field] !== undefined)
    .map((item) => sql`WHEN ${labelsTable.id} = ${item.id} THEN ${item[field]}`);

  return sql`CASE ${sql.join(cases, sql` `)} ELSE ${labelsTable[field]} END`;
};

export const PostgresLabelsRepository: LabelsRepository<PostgresTransaction> = {
  async create(input: CreateLabelInput[], tx: PostgresTransaction): Promise<Result<Label[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      return ok(await tx.insert(labelsTable).values(input).returning());
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: PostgresTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) await tx.delete(labelsTable).where(inArray(labelsTable.id, ids));
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetLabelsInput, tx: PostgresTransaction): Promise<Result<Label[], Error>> {
    try {
      const filters: SQL[] = [
        ...(input.id?.length ? [inArray(labelsTable.id, input.id)] : []),
        ...(input.version?.length ? [inArray(labelsTable.version, input.version)] : []),
        ...(input.isPrimary?.length ? [inArray(labelsTable.isPrimary, input.isPrimary)] : []),
      ];

      if (input.name?.length) {
        const nameFilter = or(...input.name.map((name) => ilike(labelsTable.name, `%${name}%`)));
        if (nameFilter) filters.push(nameFilter);
      }

      if (input.nickname?.length) {
        const nicknameFilter = or(...input.nickname.map((nickname) => ilike(labelsTable.nickname, `%${nickname}%`)));
        if (nicknameFilter) filters.push(nicknameFilter);
      }

      let query = tx.select().from(labelsTable).$dynamic();
      if (filters.length) query = query.where(and(...filters));
      if (input.sorting?.length) {
        query = query.orderBy(
          ...input.sorting.map(({ key, direction }) =>
            direction === "ASC" ? asc(labelsTable[key]) : desc(labelsTable[key]),
          ),
        );
      }
      if (input.pagination) query = query.limit(input.pagination.limit).offset(input.pagination.offset);
      return ok(await query);
    } catch (error) {
      return err(asError(error));
    }
  },

  async update(input: UpdateLabelInput[], tx: PostgresTransaction): Promise<Result<Label[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const ids = input.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) return err(new Error("Duplicate label IDs"));

      const fields = ["nickname", "isPrimary"] as const;
      const updates = Object.fromEntries(
        fields
          .filter((field) => input.some((item) => item[field] !== undefined))
          .map((field) => [field, buildCase(field, input)]),
      );
      if (Object.keys(updates).length === 0) return ok([]);

      return ok(await tx.update(labelsTable).set(updates).where(inArray(labelsTable.id, ids)).returning());
    } catch (error) {
      return err(asError(error));
    }
  },
};
