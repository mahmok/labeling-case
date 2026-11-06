import { createUnitOfWork } from "../unit-of-work.ts";
import { db, type PostgresTransaction } from "./postgres.ts";

export const PostgresUnitOfWork = createUnitOfWork<PostgresTransaction>((operation) => db.transaction(operation));
