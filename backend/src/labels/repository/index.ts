import type { PostgresTransaction } from "../../db/postgres/postgres.ts";
import type { SQLiteTransaction } from "../../db/sqlite/unit-of-work.ts";
import type { LabelsRepository } from "./interface.ts";

export function fromDialect(dialect: "postgresql"): Promise<LabelsRepository<PostgresTransaction>>;
export function fromDialect(dialect: "sqlite"): Promise<LabelsRepository<SQLiteTransaction>>;
export async function fromDialect(
  dialect: "postgresql" | "sqlite",
): Promise<LabelsRepository<PostgresTransaction> | LabelsRepository<SQLiteTransaction>> {
  switch (dialect) {
    case "postgresql":
      return (await import("./postgres.ts")).PostgresLabelsRepository;
    case "sqlite":
      throw new Error("SQLite labels repository is not implemented yet");
  }
}
