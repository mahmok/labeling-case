import { createUnitOfWork } from "../unit-of-work.ts";
import type { SQLiteDatabase } from "./sqlite.ts";

export type SQLiteTransaction = Parameters<Parameters<SQLiteDatabase["transaction"]>[0]>[0];

export const createSQLiteUnitOfWork = (db: SQLiteDatabase) =>
  createUnitOfWork<SQLiteTransaction>((operation) => db.transaction(operation));
