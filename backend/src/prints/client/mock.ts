import { logger } from "../../logger";
import { ok, type Result } from "../../utils/result.ts";
import type { PrintClient, PrintRequest, PrintResponse } from "./interface.ts";

export const MockClient: PrintClient = {
  print: async (request: PrintRequest): Promise<Result<PrintResponse, Error>> => {
    logger.debug({ msg: "Mock print request", request });
    return ok({});
  },
};
