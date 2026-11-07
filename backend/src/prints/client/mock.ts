import { ok, type Result } from "../../utils/result.ts";
import type { PrintClient, PrintRequest, PrintResponse } from "./interface.ts";

export const MockClient: PrintClient = {
  print: async (request: PrintRequest): Promise<Result<PrintResponse, Error>> => {
    // biome-ignore lint/suspicious/noConsole: Mock client, so it's okay to log the request for debugging purposes
    console.log("Mock print request:", request);
    return ok({});
  },
};
