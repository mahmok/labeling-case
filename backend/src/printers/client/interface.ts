import type { Result } from "../../utils/result.ts";

export type PrinterResponse = {
  name: string;
  model: string;
};

export type GetPrintersResponse = PrinterResponse[];

// biome-ignore lint/complexity/noBannedTypes: Can be used in the future for more complex requests
export type GetPrintersRequest = {};

export interface PrintersClient {
  get: (request: GetPrintersRequest) => Promise<Result<GetPrintersResponse, Error>>;
}
