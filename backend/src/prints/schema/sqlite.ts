import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const printsTable = sqliteTable(
  "prints",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`).notNull(),
    id: text("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    labelId: text("label_id").notNull(),
    printerId: text("printer_id"),
    printerName: text("printer_name").notNull(),
    triggeredBy: text("triggered_by").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(unixepoch() * 1000)`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("prints_printer_name_idx").on(table.printerName)],
);
