import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import type { PrintsRepository } from "./interface.ts";

export function fromDialect(dialect: "postgresql"): Promise<PrintsRepository<PostgresTransaction>>;
export function fromDialect(dialect: "sqlite"): Promise<PrintsRepository<SQLiteTransaction>>;
export async function fromDialect(
  dialect: "postgresql" | "sqlite",
): Promise<PrintsRepository<PostgresTransaction> | PrintsRepository<SQLiteTransaction>> {
  switch (dialect) {
    case "postgresql":
      return (await import("./postgres.ts")).PostgresPrintsRepository;
    case "sqlite":
      return (await import("./sqlite.ts")).SQLitePrintsRepository;
  }
}
