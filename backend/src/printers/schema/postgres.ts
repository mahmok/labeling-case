import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const printersTable = pgTable("printers", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7()),
  location: varchar("location", { length: 255 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 255 }),
  serialNumber: varchar("serial_number", { length: 255 }).notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
