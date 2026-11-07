import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../../../src/db/sqlite/sqlite.ts";
import { SQLiteUnitOfWork } from "../../../src/db/sqlite/unit-of-work.ts";
import { err, ok } from "../../../src/utils/result.ts";

const table = "unit_of_work_integration_probe";

const readValues = async (): Promise<string[]> => {
  const result = await SQLiteUnitOfWork.execute(async (tx) =>
    ok(await tx.all<{ value: string }>(sql.raw(`SELECT value FROM ${table} ORDER BY rowid`))),
  );
  if (!result.isOk) throw result.error;
  return result.value.map(({ value }) => value);
};

describe("SQLiteUnitOfWork", () => {
  beforeAll(async () => {
    await db.run(sql.raw(`CREATE TABLE ${table} (value TEXT NOT NULL)`));
  });

  beforeEach(async () => {
    await db.run(sql.raw(`DELETE FROM ${table}`));
  });

  afterAll(async () => {
    await db.run(sql.raw(`DROP TABLE ${table}`));
    await db.$client.close();
  });

  test("commits writes when the operation succeeds", async () => {
    const result = await SQLiteUnitOfWork.execute(async (tx) => {
      await tx.run(sql`INSERT INTO unit_of_work_integration_probe (value) VALUES (${"saved"})`);
      return ok("saved");
    });

    expect(result).toEqual(ok("saved"));
    expect(await readValues()).toEqual(["saved"]);
  });

  test("rolls back writes when an operation returns an error", async () => {
    const failure = new Error("reject operation");
    const result = await SQLiteUnitOfWork.execute(async (tx) => {
      await tx.run(sql`INSERT INTO unit_of_work_integration_probe (value) VALUES (${"discarded"})`);
      return err(failure);
    });

    expect(result).toEqual(err(failure));
    expect(await readValues()).toEqual([]);
  });
});
