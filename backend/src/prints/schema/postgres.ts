import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const printsTable = pgTable(
  "prints",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => Bun.randomUUIDv7()),
    labelId: varchar("label_id", { length: 255 }).notNull(),
    printerId: uuid("printer_id"),
    printerName: varchar("printer_name", { length: 255 }).notNull(),
    triggeredBy: varchar("triggered_by", { length: 255 }).notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("prints_printer_name_idx").on(table.printerName)],
);
