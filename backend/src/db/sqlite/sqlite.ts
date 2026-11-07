import { createClient } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { jobsTable } from "../../jobs/schema/sqlite.ts";
import { labelsTable } from "../../labels/schema/sqlite.ts";
import { printersTable } from "../../printers/schema/sqlite.ts";
import { printsTable } from "../../prints/schema/sqlite.ts";

export const schema: {
  jobs: typeof jobsTable;
  labels: typeof labelsTable;
  printers: typeof printersTable;
  prints: typeof printsTable;
} = { jobs: jobsTable, labels: labelsTable, printers: printersTable, prints: printsTable };
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
  await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS printers_name_unique_idx ON printers (name)");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'system',
      started_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  await client.execute("CREATE INDEX IF NOT EXISTS jobs_status_created_at_idx ON jobs (status, created_at)");
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
  await client.execute(`
    CREATE TABLE IF NOT EXISTS prints (
      id TEXT PRIMARY KEY NOT NULL,
      triggered_by TEXT NOT NULL,
      printer_id TEXT,
      printer_name TEXT NOT NULL,
      label_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )
  `);
  await client.execute("CREATE INDEX IF NOT EXISTS prints_printer_name_idx ON prints (printer_name)");

  return {
    close: async () => client.close(),
    db,
  };
};
