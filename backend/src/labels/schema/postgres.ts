import { boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const labelsTable = pgTable("labels", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: varchar("id", { length: 255 }).primaryKey(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nickname: varchar("nickname", { length: 255 }),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  version: varchar("version", { length: 255 }).notNull(),
});
