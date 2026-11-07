import type { Result } from "../../utils/result.ts";

export type LabelResponse = {
  id: string;
  name: string;
  version: number;
};

export type GetLabelsResponse = LabelResponse[];

// biome-ignore lint/complexity/noBannedTypes: Can be used in the future for more complex requests
export type GetLabelsRequest = {};

export interface LabelsClient {
  get: (request: GetLabelsRequest) => Promise<Result<GetLabelsResponse, Error>>;
}
