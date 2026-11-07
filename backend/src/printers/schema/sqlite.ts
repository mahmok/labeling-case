import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const printersTable = sqliteTable(
  "printers",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    location: text("location").notNull(),
    model: text("model").notNull(),
    name: text("name").notNull(),
    nickname: text("nickname"),
    serialNumber: text("serial_number").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("printers_name_unique_idx").on(table.name)],
);
