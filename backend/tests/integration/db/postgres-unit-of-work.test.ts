import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { config } from "../../../src/config.ts";
import { createDatabase } from "../../../src/db";
import type { PostgresTransaction } from "../../../src/db/postgres/postgres.ts";
import type { UnitOfWork } from "../../../src/db/unit-of-work.ts";
import { err, ok } from "../../../src/utils/result.ts";

const probeTableName = "unit_of_work_integration_probe";
const probeTable = pgTable(probeTableName, {
  id: serial("id").primaryKey(),
  value: text("value").notNull(),
});

let container: StartedPostgreSqlContainer | undefined;
let unitOfWork: UnitOfWork<PostgresTransaction>;
let closeDatabase: () => Promise<void> = async () => {};

const readValues = async (): Promise<string[]> => {
  const result = await unitOfWork.execute(async (tx) =>
    ok(await tx.select({ value: probeTable.value }).from(probeTable).orderBy(probeTable.id)),
  );
  if (!result.isOk) throw result.error;
  return result.value.map(({ value }) => value);
};

describe("PostgresUnitOfWork", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("unit_of_work_test")
      .withUsername("test")
      .withPassword("test")
      .start();
    Object.assign(config.database, {
      dialect: "postgresql",
      host: container.getHost(),
      name: container.getDatabase(),
      password: container.getPassword(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
    });

    const database = await createDatabase();
    if (database.dialect !== "postgresql") throw new Error("Expected PostgreSQL database");
    unitOfWork = database.uow;
    closeDatabase = database.close;
    await database.db.execute(
      sql.raw(`
      CREATE TABLE ${probeTableName} (
        id serial PRIMARY KEY,
        value text NOT NULL
      )
    `),
    );
  }, 120_000);

  beforeEach(async () => {
    const result = await unitOfWork.execute(async (tx) => {
      await tx.delete(probeTable);
      return ok();
    });
    if (!result.isOk) throw result.error;
  });

  afterAll(async () => {
    await closeDatabase();
    await container?.stop();
  }, 30_000);

  test("commits writes when the operation succeeds", async () => {
    const result = await unitOfWork.execute(async (tx) => {
      await tx.insert(probeTable).values({ value: "committed" });
      return ok("committed");
    });

    expect(result).toEqual(ok("committed"));
    expect(await readValues()).toEqual(["committed"]);
  });

  test("rolls back writes when the operation returns an error", async () => {
    const failure = new Error("reject operation");
    const result = await unitOfWork.execute(async (tx) => {
      await tx.insert(probeTable).values({ value: "discarded" });
      return err(failure);
    });

    expect(result).toEqual(err(failure));
    expect(await readValues()).toEqual([]);
  });

  test("rolls back writes and returns an error when the operation throws", async () => {
    const result = await unitOfWork.execute(async (tx) => {
      await tx.insert(probeTable).values({ value: "discarded" });
      throw new Error("unexpected failure");
    });

    expect(result.isOk).toBe(false);
    if (!result.isOk) expect(result.error.message).toBe("unexpected failure");
    expect(await readValues()).toEqual([]);
  });
});
