import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { labelsTable } from "../../labels/schema/sqlite.ts";
import { printersTable } from "../../printers/schema/sqlite.ts";

const client = createClient({ url: "file::memory:" });
export const schema = { labels: labelsTable, printers: printersTable };
export const db = drizzle(client, { schema });

export const initialize = async (): Promise<void> => {
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
};

export const close = async (): Promise<void> => {
  await client.close();
};
