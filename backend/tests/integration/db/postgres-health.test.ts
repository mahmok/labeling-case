import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { config } from "../../../src/config.ts";
import { createDatabase, type Database } from "../../../src/db";

let container: StartedPostgreSqlContainer | undefined;
let database: Database;

describe("PostgreSQL health check", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-alpine")
      .withDatabase("labeling_health_test")
      .withUsername("test")
      .withPassword("test")
      .start();
    Object.assign(config.database, {
      connectionTimeoutMs: 2000,
      dialect: "postgresql",
      host: container.getHost(),
      name: container.getDatabase(),
      password: container.getPassword(),
      port: container.getMappedPort(5432),
      user: container.getUsername(),
    });
    database = await createDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
    await container?.stop();
  });

  test("ping succeeds while the database is up and fails promptly once it is stopped", async () => {
    expect(await database.ping()).toEqual({ isOk: true, value: undefined });

    await container?.stop();
    const startedAt = performance.now();
    const result = await database.ping();

    expect(result.isOk).toBe(false);
    expect(performance.now() - startedAt).toBeLessThan(10_000);
  }, 60_000);
});
