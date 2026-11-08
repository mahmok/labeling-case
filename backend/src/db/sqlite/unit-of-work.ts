import type { ResultSet } from "@libsql/client";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteTransaction as DrizzleSQLiteTransaction } from "drizzle-orm/sqlite-core";
import { createUnitOfWork, type UnitOfWork } from "../unit-of-work.ts";
import type { SQLiteDatabase, schema } from "./sqlite.ts";

type SQLiteSchema = typeof schema;

export type SQLiteTransaction = DrizzleSQLiteTransaction<
  "async",
  ResultSet,
  SQLiteSchema,
  ExtractTablesWithRelations<SQLiteSchema>
>;

export const createSQLiteUnitOfWork = (db: SQLiteDatabase): UnitOfWork<SQLiteTransaction> =>
  createUnitOfWork<SQLiteTransaction>((operation) => db.transaction(operation));
