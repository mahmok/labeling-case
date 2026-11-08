import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { config } from "../../config.ts";
import { logger } from "../../logger";
import schema from "./schema.ts";

const pool = new Pool({
  connectionTimeoutMillis: config.database.connectionTimeoutMs,
  database: config.database.name,
  host: config.database.host,
  password: config.database.password,
  port: config.database.port,
  user: config.database.user,
});

pool.on("error", (error: Error) => {
  logger.error({ error: error.message, msg: "Idle PostgreSQL client error" });
});

export const db = drizzle(pool, { schema });
export const close = (): Promise<void> => pool.end();

type PostgresSchema = typeof schema;

export type PostgresTransaction = PgTransaction<
  NodePgQueryResultHKT,
  PostgresSchema,
  ExtractTablesWithRelations<PostgresSchema>
>;
