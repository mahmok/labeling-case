import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { SQLiteDatabase } from "../../../src/db/sqlite/sqlite.ts";
import type { SQLiteTransaction } from "../../../src/db/sqlite/unit-of-work.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import { err, ok } from "../../../src/utils/result.ts";

const table = "unit_of_work_integration_probe";

let db: SQLiteDatabase;
let unitOfWork: UnitOfWork<SQLiteTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const readValues = async (): Promise<string[]> => {
  const result = await unitOfWork.execute(async (tx) =>
    ok(await tx.all<{ value: string }>(sql.raw(`SELECT value FROM ${table} ORDER BY rowid`))),
  );
  if (!result.isOk) throw result.error;
  return result.value.map(({ value }) => value);
};

describe("SQLiteUnitOfWork", () => {
  beforeAll(async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();
    if (database.dialect !== "sqlite") throw new Error("Expected SQLite database");
    db = database.db;
    unitOfWork = database.uow;
    closeDatabase = database.close;
    await db.run(sql.raw(`CREATE TABLE ${table} (value TEXT NOT NULL)`));
  });

  beforeEach(async () => {
    await db.run(sql.raw(`DELETE FROM ${table}`));
  });

  afterAll(async () => {
    await db.run(sql.raw(`DROP TABLE ${table}`));
    await closeDatabase();
  });

  test("commits writes when the operation succeeds", async () => {
    const result = await unitOfWork.execute(async (tx) => {
      await tx.run(sql`INSERT INTO unit_of_work_integration_probe (value) VALUES (${"saved"})`);
      return ok("saved");
    });

    expect(result).toEqual(ok("saved"));
    expect(await readValues()).toEqual(["saved"]);
  });

  test("rolls back writes when an operation returns an error", async () => {
    const failure = new Error("reject operation");
    const result = await unitOfWork.execute(async (tx) => {
      await tx.run(sql`INSERT INTO unit_of_work_integration_probe (value) VALUES (${"discarded"})`);
      return err(failure);
    });

    expect(result).toEqual(err(failure));
    expect(await readValues()).toEqual([]);
  });
});
