import { Hono } from "hono";
import { createDatabase, type Database } from "./db";
import { PrintersApi } from "./printers";

export type App = {
  api: Hono;
  db: Database;
};

export const rootApi = new Hono();
rootApi.get("/health", (c) =>
  c.json({
    status: "running",
  }),
);

const api = rootApi.basePath("/api");
const v1 = api.basePath("/v1");
v1.route("/printers", PrintersApi);

export const createApp = async (): Promise<App> => {
  return {
    api: rootApi,
    db: await createDatabase(),
  };
};
