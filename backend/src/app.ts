import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { createDatabase, type Database } from "./db";
import { createLabelsApi } from "./labels";
import { fromDialect as labelsFromDialect } from "./labels/repository";
import { createLabelUseCases, type Dependencies as LabelDependencies } from "./labels/use-cases.ts";
import { createPrintersApi } from "./printers";
import { fromDialect as printersFromDialect } from "./printers/repository";
import { createPrinterUseCases, type Dependencies } from "./printers/use-cases.ts";

export type App = {
  api: Hono;
  db: Database;
};

const createPrintersRouter = <T>(deps: Dependencies<T>): Hono => createPrintersApi(createPrinterUseCases(deps));
const createLabelsRouter = <T>(deps: LabelDependencies<T>): Hono => createLabelsApi(createLabelUseCases(deps));

const createRootApi = (): Hono => {
  const api = new Hono();
  api.get("/health", (c) => c.json({ status: "running" }));
  return api;
};

export const createApp = async (database?: Database): Promise<App> => {
  const db = database ?? (await createDatabase());
  const api = createRootApi();
  const v1 = api.basePath("/api").basePath("/v1");

  switch (db.dialect) {
    case "postgresql":
      v1.route("/printers", createPrintersRouter({ repository: await printersFromDialect("postgresql"), uow: db.uow }));
      v1.route("/labels", createLabelsRouter({ repository: await labelsFromDialect("postgresql"), uow: db.uow }));
      break;
    case "sqlite":
      v1.route("/printers", createPrintersRouter({ repository: await printersFromDialect("sqlite"), uow: db.uow }));
      v1.route("/labels", createLabelsRouter({ repository: await labelsFromDialect("sqlite"), uow: db.uow }));
      break;
  }

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

  return { api, db };
};
