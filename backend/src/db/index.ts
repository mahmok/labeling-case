import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "../config.ts";
import { logger } from "../logger";
import type { PostgresTransaction } from "./postgres/postgres.ts";
import type PostgresSchema from "./postgres/schema.ts";
import { PostgresUnitOfWork } from "./postgres/unit-of-work.ts";
import { type SQLiteTransaction, SQLiteUnitOfWork } from "./sqlite/unit-of-work.ts";
import type { UnitOfWork } from "./unit-of-work.ts";

type PostgresDatabase = NodePgDatabase<typeof PostgresSchema>;

export type Database =
  | { dialect: "sqlite"; db: LibSQLDatabase; uow: UnitOfWork<SQLiteTransaction> }
  | { dialect: "postgresql"; db: PostgresDatabase; uow: UnitOfWork<PostgresTransaction> };

export const createDatabase = async (): Promise<Database> => {
  const dialect = config.database.dialect;

  if (dialect === "sqlite") {
    const { db } = await import("./sqlite/sqlite.ts");
    return { db, dialect, uow: SQLiteUnitOfWork };
  }

  if (dialect === "postgresql") {
    const { db } = await import("./postgres/postgres.ts");
    logger.info({ msg: `Connected to PostgreSQL database at ${config.database.host}` });
    return { db, dialect, uow: PostgresUnitOfWork };
  }

  throw new Error(`Unsupported database: ${dialect}`);
};
