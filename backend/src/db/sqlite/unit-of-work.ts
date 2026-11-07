import { createUnitOfWork, type UnitOfWork } from "../unit-of-work.ts";
import type { SQLiteDatabase } from "./sqlite.ts";

export type SQLiteTransaction = Parameters<Parameters<SQLiteDatabase["transaction"]>[0]>[0];

export const createSQLiteUnitOfWork = (db: SQLiteDatabase): UnitOfWork<SQLiteTransaction> =>
  createUnitOfWork<SQLiteTransaction>((operation) => db.transaction(operation));
