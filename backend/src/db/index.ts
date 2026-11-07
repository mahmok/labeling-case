import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "../config.ts";
import { logger } from "../logger";
import type { PostgresTransaction } from "./postgres/postgres.ts";
import type PostgresSchema from "./postgres/schema.ts";
import type { SQLiteDatabase } from "./sqlite/sqlite.ts";
import type { SQLiteTransaction } from "./sqlite/unit-of-work.ts";
import type { UnitOfWork } from "./unit-of-work.ts";

type PostgresDatabase = NodePgDatabase<typeof PostgresSchema>;
type CloseDatabase = { close: () => Promise<void> };

export type Database =
  | ({ dialect: "sqlite"; db: SQLiteDatabase; uow: UnitOfWork<SQLiteTransaction> } & CloseDatabase)
  | ({ dialect: "postgresql"; db: PostgresDatabase; uow: UnitOfWork<PostgresTransaction> } & CloseDatabase);

export const createDatabase = async (): Promise<Database> => {
  const dialect = config.database.dialect;

  if (dialect === "sqlite") {
    const { createSqliteDatabase } = await import("./sqlite/sqlite.ts");
    const { createSQLiteUnitOfWork } = await import("./sqlite/unit-of-work.ts");
    const { close, db } = await createSqliteDatabase();
    return { close, db, dialect, uow: createSQLiteUnitOfWork(db) };
  }

  if (dialect === "postgresql") {
    const { close, db } = await import("./postgres/postgres.ts");
    const { PostgresUnitOfWork } = await import("./postgres/unit-of-work.ts");
    logger.info({ msg: `Connected to PostgreSQL database at ${config.database.host}` });
    return { close, db, dialect, uow: PostgresUnitOfWork };
  }

  throw new Error(`Unsupported database: ${dialect}`);
};
