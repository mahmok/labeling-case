import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../../config.ts";
import schema from "./schema.ts";

const pool = new Pool({
  database: config.database.name,
  host: config.database.host,
  password: config.database.password,
  port: config.database.port,
  user: config.database.user,
});

export const db = drizzle(pool, { schema });
export const close = (): Promise<void> => pool.end();

export type PostgresTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
