import { defineConfig } from "drizzle-kit";
import { config } from "../config.ts";

export default defineConfig({
  dbCredentials: {
    database: "labeling",
    host: config.database.host,
    password: config.database.password,
    port: 5432,
    ssl: false,
    user: config.database.user,
  },
  dialect: config.database.dialect,
  out: "./migrations",
  schema: ["src/printers/schema/postgres.ts"],
  verbose: true,
});
