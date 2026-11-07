import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { labelsTable } from "../../labels/schema/sqlite.ts";
import { printersTable } from "../../printers/schema/sqlite.ts";

export const schema = { labels: labelsTable, printers: printersTable };
export type SQLiteDatabase = LibSQLDatabase<typeof schema>;

export const createSqliteDatabase = async (): Promise<{ db: SQLiteDatabase; close: () => Promise<void> }> => {
  const client = createClient({ url: "file::memory:" });
  const db = drizzle(client, { schema });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      model TEXT NOT NULL,
      nickname TEXT,
      location TEXT NOT NULL,
      serial_number TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS printers_name_unique_idx ON printers (name)`);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);

  return {
    close: async () => client.close(),
    db,
  };
};
