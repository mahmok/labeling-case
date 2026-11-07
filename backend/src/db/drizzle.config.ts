import { defineConfig } from "drizzle-kit";
import { config } from "../config.ts";

export default defineConfig({
  dbCredentials: {
    database: config.database.name,
    host: config.database.host,
    password: config.database.password,
    port: config.database.port,
    ssl: false,
    user: config.database.user,
  },
  dialect: config.database.dialect,
  out: "./migrations",
  schema: ["src/printers/schema/postgres.ts", "src/labels/schema/postgres.ts", "src/jobs/schema/postgres.ts"],
  verbose: true,
});
