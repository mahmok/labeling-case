import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { config } from "./src/config.ts";
import { logger } from "./src/logger";

if (config.database.dialect !== "postgresql") {
  throw new Error("The migration runner currently supports PostgreSQL only");
}

const pool = new Pool({
  database: config.database.name,
  host: config.database.host,
  password: config.database.password,
  port: config.database.port,
  user: config.database.user,
});

try {
  await migrate(drizzle(pool), {
    migrationsFolder: resolve(import.meta.dir, "migrations"),
  });
  logger.info({ msg: "Database migrations applied" });
} finally {
  await pool.end();
}
