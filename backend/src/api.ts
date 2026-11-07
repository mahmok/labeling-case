import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import type { ApplicationUseCases } from "./application.ts";
import { createJobsApi } from "./jobs/api.ts";
import { createLabelsApi } from "./labels";
import { createPrintersApi } from "./printers";

export const createApi = (useCases: ApplicationUseCases): Hono => {
  const api = new Hono();
  api.get("/health", (c) => c.json({ status: "running" }));

  const v1 = api.basePath("/api").basePath("/v1");
  v1.route("/printers", createPrintersApi(useCases.printers));
  v1.route("/labels", createLabelsApi(useCases.labels));
  v1.route("/jobs", createJobsApi(useCases.jobs));

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
