import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { createDatabase, type Database } from "./db";
import { createLabelsApi, createLabelUseCases, type LabelUseCases } from "./labels";
import { MockClient as MockLabelsClient } from "./labels/client/mock.ts";
import { fromDialect as labelsFromDialect } from "./labels/repository";
import { createPrintersApi, createPrinterUseCases, type PrinterUseCases } from "./printers";
import { MockClient as MockPrintersClient } from "./printers/client/mock.ts";
import { fromDialect as printersFromDialect } from "./printers/repository";

export type AppUseCases = {
  labels: LabelUseCases;
  printers: PrinterUseCases;
};

export type App = {
  api: Hono;
  db: Database;
  useCases: AppUseCases;
};

const createPrintersRouter = (useCases: PrinterUseCases): Hono => createPrintersApi(useCases);
const createLabelsRouter = (useCases: LabelUseCases): Hono => createLabelsApi(useCases);

const createRootApi = (): Hono => {
  const api = new Hono();
  api.get("/health", (c) => c.json({ status: "running" }));
  return api;
};

const createUseCases = async (db: Database): Promise<AppUseCases> => {
  switch (db.dialect) {
    case "postgresql":
      return {
        labels: createLabelUseCases({
          client: MockLabelsClient,
          repository: await labelsFromDialect("postgresql"),
          uow: db.uow,
        }),
        printers: createPrinterUseCases({
          client: MockPrintersClient,
          repository: await printersFromDialect("postgresql"),
          uow: db.uow,
        }),
      };
    case "sqlite":
      return {
        labels: createLabelUseCases({
          client: MockLabelsClient,
          repository: await labelsFromDialect("sqlite"),
          uow: db.uow,
        }),
        printers: createPrinterUseCases({
          client: MockPrintersClient,
          repository: await printersFromDialect("sqlite"),
          uow: db.uow,
        }),
      };
  }
};

export const createApp = async (database?: Database): Promise<App> => {
  const db = database ?? (await createDatabase());
  const useCases = await createUseCases(db);
  const api = createRootApi();
  const v1 = api.basePath("/api").basePath("/v1");

  v1.route("/printers", createPrintersRouter(useCases.printers));
  v1.route("/labels", createLabelsRouter(useCases.labels));

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

  return { api, db, useCases };
};
