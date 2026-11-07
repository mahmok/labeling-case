import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import type { JobsRepository } from "./interface.ts";

export function fromDialect(dialect: "postgresql"): Promise<JobsRepository<PostgresTransaction>>;
export function fromDialect(dialect: "sqlite"): Promise<JobsRepository<SQLiteTransaction>>;
export async function fromDialect(
  dialect: "postgresql" | "sqlite",
): Promise<JobsRepository<PostgresTransaction> | JobsRepository<SQLiteTransaction>> {
  switch (dialect) {
    case "postgresql":
      return (await import("./postgres.ts")).PostgresJobsRepository;
    case "sqlite":
      return (await import("./sqlite.ts")).SQLiteJobsRepository;
  }
}
