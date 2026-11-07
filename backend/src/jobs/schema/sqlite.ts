import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { JobResult, JobStatus } from "../domain.ts";

export const jobsTable = sqliteTable(
  "jobs",
  {
    attempts: integer("attempts").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
    error: text("error"),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    result: text("result", { mode: "json" }).$type<JobResult | undefined>(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    status: text("status").$type<JobStatus>().default("pending").notNull(),
    triggeredBy: text("triggered_by").default("system").notNull(),
    type: text("type").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("jobs_status_created_at_idx").on(table.status, table.createdAt)],
);
