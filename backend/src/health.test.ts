import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { config } from "./config.ts";
import { createDatabase } from "./db";
import { alwaysHealthy, createHealthHandler, type HealthCheck, livenessHandler } from "./health.ts";
import { err } from "./utils/result.ts";

const healthApp = (check: HealthCheck): Hono =>
  new Hono().get("/health/live", livenessHandler).get("/health", createHealthHandler(check));

describe("Health handler", () => {
  test("reports running while the check passes", async () => {
    const response = await healthApp(alwaysHealthy).request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "running" });
  });

  test("liveness stays up even when the dependency check fails", async () => {
    const app = healthApp(async () => err(new Error("connection refused")));
    const live = await app.request("/health/live");
    const ready = await app.request("/health");

    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "alive" });
    expect(ready.status).toBe(503);
  });

  test("reports 503 with an error message when the check fails", async () => {
    const response = await healthApp(async () => err(new Error("connection refused"))).request("/health");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { message: "Database is unavailable" }, status: "unavailable" });
  });
});

describe("Database ping", () => {
  test("succeeds on an open database and fails once it is closed", async () => {
    config.database.dialect = "sqlite";
    const database = await createDatabase();

    expect(await database.ping()).toEqual({ isOk: true, value: undefined });

    await database.close();
    expect((await database.ping()).isOk).toBe(false);
  });
});
