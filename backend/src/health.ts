import type { Context } from "hono";
import { ok, type Result } from "./utils/result.ts";

export type HealthCheck = () => Promise<Result<void, Error>>;

export const livenessHandler = (c: Context): Response => c.json({ status: "alive" }, 200);

export const alwaysHealthy: HealthCheck = async () => ok();

export const createHealthHandler =
  (check: HealthCheck) =>
  async (c: Context): Promise<Response> => {
    const result = await check();
    if (result.isOk) return c.json({ status: "running" }, 200);
    return c.json({ error: { message: "Database is unavailable" }, status: "unavailable" }, 503);
  };
