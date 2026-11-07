import type { Context, TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { JSONParsed } from "hono/utils/types";

export type ApiSuccess<T> = {
  data: T;
};

export type ApiError = {
  error: {
    message: string;
  };
};

export const success = <T, S extends ContentfulStatusCode = 200>(
  c: Context,
  data: T,
  status: S = 200 as S,
): TypedResponse<JSONParsed<ApiSuccess<T>>, S, "json"> => {
  return c.json<ApiSuccess<T>, S>({ data }, status);
};

export const error = <S extends ContentfulStatusCode = 500>(
  c: Context,
  message: string,
  status: S = 500 as S,
): TypedResponse<JSONParsed<ApiError>, S, "json"> => {
  return c.json<ApiError, S>({ error: { message } }, status);
};
