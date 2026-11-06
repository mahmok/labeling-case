import { Hono } from "hono";
import { PrintersApi } from "./printers";

export const RootApp = new Hono();
RootApp.get("/health", (c) =>
  c.json({
    status: "running",
  }),
);

const api = RootApp.basePath("/api");
const v1 = api.basePath("/v1");
v1.route("/printers", PrintersApi);
