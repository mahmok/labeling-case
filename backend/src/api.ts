import { Hono } from "hono";
import { cors } from "hono/cors";
import { openAPIRouteHandler } from "hono-openapi";
import type { ApplicationUseCases } from "./application.ts";
import { alwaysHealthy, createHealthHandler, type HealthCheck, livenessHandler } from "./health.ts";
import { createJobsApi } from "./jobs/api.ts";
import { createLabelsApi } from "./labels";
import { createPrintersApi } from "./printers";
import { createPrintsApi } from "./prints/api.ts";

export const createApi = (useCases: ApplicationUseCases, healthCheck: HealthCheck = alwaysHealthy): Hono => {
  const api = new Hono();
  // TODO: Remove later
  api.use("*", cors());
  api.get("/health/live", livenessHandler);
  api.get("/health", createHealthHandler(healthCheck));

  const v1 = api.basePath("/api").basePath("/v1");
  v1.route("/printers", createPrintersApi(useCases.printers));
  v1.route("/labels", createLabelsApi(useCases.labels));
  v1.route("/jobs", createJobsApi(useCases.jobs));
  v1.route("/prints", createPrintsApi(useCases.prints));

  api.get(
    "/openapi.json",
    openAPIRouteHandler(api, {
      defaultValidationErrorResponse: false,
      documentation: {
        info: { title: "Labeling API", version: "1.0.0" },
        openapi: "3.1.0",
        servers: [{ url: "/" }],
      },
    }),
  );

  return api;
};
