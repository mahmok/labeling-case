import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const labelsTable = sqliteTable("labels", {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .notNull(),
  id: text("id").primaryKey(),
  isPrimary: integer("is_primary", { mode: "boolean" }).default(false).notNull(),
  name: text("name").notNull(),
  nickname: text("nickname"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date())
    .notNull(),
  version: text("version").notNull(),
});
