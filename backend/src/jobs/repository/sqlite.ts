import { and, asc, desc, eq, inArray, notExists, type SQL, sql } from "drizzle-orm";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Job } from "../domain.ts";
import { jobsTable } from "../schema/sqlite.ts";
import type { CreateJobInput, GetJobsInput, JobsRepository, UpdateJobInput } from "./interface.ts";
import { type JobRecord, toJob } from "./mapper";

export const SQLiteJobsRepository: JobsRepository<SQLiteTransaction> = {
  async claimNext(type: string, tx: SQLiteTransaction): Promise<Result<Job | null, Error>> {
    try {
      const candidate = tx
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(and(eq(jobsTable.status, "pending"), eq(jobsTable.type, type)))
        .orderBy(asc(jobsTable.createdAt), asc(jobsTable.id))
        .limit(1);
      const [claimed] = await tx
        .update(jobsTable)
        .set({ attempts: sql`${jobsTable.attempts} + 1`, startedAt: new Date(), status: "in_progress" })
        .where(
          and(
            eq(jobsTable.status, "pending"),
            eq(jobsTable.type, type),
            inArray(jobsTable.id, candidate),
            notExists(
              tx
                .select({ id: jobsTable.id })
                .from(jobsTable)
                .where(and(eq(jobsTable.status, "in_progress"), eq(jobsTable.type, type))),
            ),
          ),
        )
        .returning();
      return ok(claimed ? toJob(claimed) : null);
    } catch (error) {
      return err(asError(error));
    }
  },
  async create(input: CreateJobInput[], tx: SQLiteTransaction): Promise<Result<Job[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const jobs = await tx.insert(jobsTable).values(input).returning();
      return ok(jobs.map(toJob));
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: SQLiteTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) await tx.delete(jobsTable).where(inArray(jobsTable.id, ids));
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetJobsInput, tx: SQLiteTransaction): Promise<Result<Job[], Error>> {
    try {
      const filters: SQL[] = [
        ...(input.id?.length ? [inArray(jobsTable.id, input.id)] : []),
        ...(input.type?.length ? [inArray(jobsTable.type, input.type)] : []),
        ...(input.status?.length ? [inArray(jobsTable.status, input.status)] : []),
        ...(input.triggeredBy?.length ? [inArray(jobsTable.triggeredBy, input.triggeredBy)] : []),
      ];

      let query = tx.select().from(jobsTable).$dynamic();
      if (filters.length) query = query.where(and(...filters));
      if (input.sorting?.length) {
        query = query.orderBy(
          ...input.sorting.map(({ key, direction }) =>
            direction === "ASC" ? asc(jobsTable[key]) : desc(jobsTable[key]),
          ),
        );
      }
      if (input.pagination) query = query.limit(input.pagination.limit).offset(input.pagination.offset);
      return ok((await query).map(toJob));
    } catch (error) {
      return err(asError(error));
    }
  },

  async update(input: UpdateJobInput[], tx: SQLiteTransaction): Promise<Result<Job[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const ids = input.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) return err(new Error("Duplicate job IDs"));

      const fields = ["attempts", "status", "result", "error"] as const;
      const updated: JobRecord[] = [];
      for (const item of input) {
        const changes = Object.fromEntries(
          fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]),
        );
        if (Object.keys(changes).length === 0) continue;
        updated.push(...(await tx.update(jobsTable).set(changes).where(eq(jobsTable.id, item.id)).returning()));
      }
      return ok(updated.map(toJob));
    } catch (error) {
      return err(asError(error));
    }
  },
};
