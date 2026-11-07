import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import type { PrintersRepository } from "./interface.ts";

export function fromDialect(dialect: "postgresql"): Promise<PrintersRepository<PostgresTransaction>>;
export function fromDialect(dialect: "sqlite"): Promise<PrintersRepository<SQLiteTransaction>>;
export async function fromDialect(
  dialect: "postgresql" | "sqlite",
): Promise<PrintersRepository<PostgresTransaction> | PrintersRepository<SQLiteTransaction>> {
  switch (dialect) {
    case "postgresql":
      return (await import("./postgres.ts")).PostgresPrintersRepository;
    case "sqlite":
      return (await import("./sqlite.ts")).SQLitePrintersRepository;
  }
}
