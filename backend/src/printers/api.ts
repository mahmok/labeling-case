import { Hono } from "hono";

export const PrintersApi = new Hono().get("/", (c) => c.json({ message: "Hello from Printers API!" }));
