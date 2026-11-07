import type { Job } from "../domain.ts";
import type { jobsTable } from "../schema/postgres.ts";

export type JobRecord = typeof jobsTable.$inferSelect;

export const toJob = (record: JobRecord): Job => {
  const endTime = record.status === "in_progress" ? Date.now() : record.updatedAt.getTime();
  const durationMs = record.startedAt === null ? null : Math.max(0, endTime - record.startedAt.getTime());

  return { ...record, durationMs };
};
