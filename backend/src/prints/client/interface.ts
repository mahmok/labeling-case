import type { Result } from "../../utils/result.ts";

export type PrintRequest = {
  labelId: string;
  printerName: string;
};

// biome-ignore lint/complexity/noBannedTypes: Can be used in the future for more complex requests
export type PrintResponse = {};

export interface PrintClient {
  print: (request: PrintRequest) => Promise<Result<PrintResponse, Error>>;
}
