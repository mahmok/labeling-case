import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import { asError, err, ok, type Result } from "../../utils/result.ts";
import type { Job } from "../domain.ts";
import { jobsTable } from "../schema/postgres.ts";
import type { CreateJobInput, GetJobsInput, JobsRepository, UpdateJobInput } from "./interface.ts";
import { toJob } from "./mapper.ts";

const buildCase = <K extends keyof UpdateJobInput>(field: K, input: UpdateJobInput[]): SQL => {
  const cases = input
    .filter((item) => item[field] !== undefined)
    .map((item) => sql`WHEN ${jobsTable.id} = ${item.id} THEN ${item[field]}`);

  return sql`CASE ${sql.join(cases, sql` `)} ELSE ${jobsTable[field]} END`;
};

export const PostgresJobsRepository: JobsRepository<PostgresTransaction> = {
  async claimNext(type: string, tx: PostgresTransaction): Promise<Result<Job | null, Error>> {
    try {
      const [candidate] = await tx
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(and(eq(jobsTable.status, "pending"), eq(jobsTable.type, type)))
        .orderBy(asc(jobsTable.createdAt), asc(jobsTable.id))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return ok(null);

      const [claimed] = await tx
        .update(jobsTable)
        .set({ attempts: sql`${jobsTable.attempts} + 1`, startedAt: new Date(), status: "in_progress" })
        .where(and(eq(jobsTable.id, candidate.id), eq(jobsTable.status, "pending"), eq(jobsTable.type, type)))
        .returning();
      return ok(claimed ? toJob(claimed) : null);
    } catch (error) {
      return err(asError(error));
    }
  },
  async create(input: CreateJobInput[], tx: PostgresTransaction): Promise<Result<Job[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const jobs = await tx.insert(jobsTable).values(input).returning();
      return ok(jobs.map(toJob));
    } catch (error) {
      return err(asError(error));
    }
  },

  async delete(ids: string[], tx: PostgresTransaction): Promise<Result<void, Error>> {
    try {
      if (ids.length > 0) await tx.delete(jobsTable).where(inArray(jobsTable.id, ids));
      return ok();
    } catch (error) {
      return err(asError(error));
    }
  },

  async get(input: GetJobsInput, tx: PostgresTransaction): Promise<Result<Job[], Error>> {
    try {
      const filters = [
        ...(input.id?.length ? [inArray(jobsTable.id, input.id)] : []),
        ...(input.type?.length ? [inArray(jobsTable.type, input.type)] : []),
        ...(input.status?.length ? [inArray(jobsTable.status, input.status)] : []),
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

  async update(input: UpdateJobInput[], tx: PostgresTransaction): Promise<Result<Job[], Error>> {
    try {
      if (input.length === 0) return ok([]);
      const ids = input.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) return err(new Error("Duplicate job IDs"));

      const fields = ["attempts", "status", "result", "error"] as const;
      const updates = Object.fromEntries(
        fields
          .filter((field) => input.some((item) => item[field] !== undefined))
          .map((field) => [field, buildCase(field, input)]),
      );
      if (Object.keys(updates).length === 0) return ok([]);

      const jobs = await tx.update(jobsTable).set(updates).where(inArray(jobsTable.id, ids)).returning();
      return ok(jobs.map(toJob));
    } catch (error) {
      return err(asError(error));
    }
  },
};
