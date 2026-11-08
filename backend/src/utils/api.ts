import type { Context, MiddlewareHandler, Next, TypedResponse } from "hono";
import { HTTPException } from "hono/http-exception";
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

const JSON_CONTENT_TYPE = /^application\/([a-z0-9.+-]+\+)?json$/i;

export const requireJson: MiddlewareHandler = async (c: Context, next: Next): Promise<void> => {
  const contentType = c.req.header("content-type")?.split(";")[0]?.trim() ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new HTTPException(415, { message: "Content-Type must be application/json" });
  }
  await next();
};
