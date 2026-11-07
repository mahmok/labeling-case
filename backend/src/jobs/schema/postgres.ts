import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { JobResult, JobStatus } from "../domain.ts";

export const jobsTable = pgTable(
  "jobs",
  {
    attempts: integer("attempts").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    error: text("error"),
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    result: jsonb("result").$type<JobResult | undefined>(),
    startedAt: timestamp("started_at"),
    status: varchar("status", { length: 32 }).$type<JobStatus>().default("pending").notNull(),
    triggeredBy: varchar("triggered_by", { length: 255 }).default("system").notNull(),
    type: varchar("type", { length: 255 }).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("jobs_status_created_at_idx").on(table.status, table.createdAt)],
);
