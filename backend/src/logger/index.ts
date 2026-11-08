import pino from "pino";
import { config } from "../config.ts";

const STDERR_FILE_DESCRIPTOR = 2;

export const logger = pino(
  { level: config.logger.level },
  config.logger.destination === "stderr" ? pino.destination(STDERR_FILE_DESCRIPTOR) : undefined,
);
