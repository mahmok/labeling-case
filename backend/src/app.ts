import { Hono } from "hono";
import { createDatabase, type Database } from "./db";
import { createPrintersApi } from "./printers";
import { fromDialect } from "./printers/repository";
import { createPrinterUseCases, type Dependencies } from "./printers/use-cases.ts";

export type App = {
  api: Hono;
  db: Database;
};

const createPrintersRouter = <T>(deps: Dependencies<T>): Hono => createPrintersApi(createPrinterUseCases(deps));

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
      v1.route("/printers", createPrintersRouter({ repository: await fromDialect("postgresql"), uow: db.uow }));
      break;
    case "sqlite":
      v1.route("/printers", createPrintersRouter({ repository: await fromDialect("sqlite"), uow: db.uow }));
      break;
  }

  return { api, db };
};
