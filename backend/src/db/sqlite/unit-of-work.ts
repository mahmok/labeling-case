import { createUnitOfWork } from "../unit-of-work.ts";
import { db } from "./sqlite.ts";

export type SQLiteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const SQLiteUnitOfWork = createUnitOfWork<SQLiteTransaction>((operation) => db.transaction(operation));
