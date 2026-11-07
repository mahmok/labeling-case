import { config } from "../config.ts";

const API_BASE_URL = config.labelingBaseUrl.replace(/\/$/, "");
export const API_PREFIX = `${API_BASE_URL}/api/v1`;

export type QueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;
export type QueryParams = Record<string, QueryValue>;
export type DataResponse<T> = { data: T };

export const toSearchParams = (query: QueryParams = {}): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  const search = params.toString();
  return search ? `?${search}` : "";
};

export const responseError = async (response: Response): Promise<Error> => {
  let message = `Request failed with status ${response.status}`;
  try {
    const payload: unknown = await response.json();
    if (
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
    ) {
      message = payload.error.message;
    }
  } catch {
    // Keep the status-based message for empty or non-JSON error responses.
  }
  return new Error(message);
};
