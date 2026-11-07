import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResponsesWithResolver } from "hono-openapi";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { isNotFoundError } from "../utils/errors.ts";
import type { Result } from "../utils/result.ts";
import type { GetPrintsInput } from "./repository/interface.ts";
import type { PrintsUseCases } from "./use-cases.ts";

const PrintSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  label: z.object({
    id: z.string(),
    name: z.string().nullable(),
    version: z.string().nullable(),
  }),
  printer: z.object({ id: z.uuid().nullable(), name: z.string() }),
  triggeredBy: z.string(),
  updatedAt: z.iso.datetime(),
});
const PrintResponseSchema = z.object({ data: PrintSchema });
const PrintsResponseSchema = z.object({ data: z.array(PrintSchema) });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const PrintIdSchema = z.uuid();
const QueryIntegerSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));
const SortEntrySchema = z
  .string()
  .regex(
    /^[+-](id|printerId|printerName|triggeredBy|labelId|labelName|labelVersion|createdAt|updatedAt)$/,
    "sort must use +key or -key",
  )
  .transform((value) => ({
    direction: value.startsWith("+") ? ("ASC" as const) : ("DESC" as const),
    key: value.slice(1) as NonNullable<GetPrintsInput["sorting"]>[number]["key"],
  }));

const repeated = <T extends z.ZodType>(schema: T): z.ZodType<z.output<T>[], z.input<T> | z.input<T>[]> =>
  z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));

const ListPrintsQuerySchema = z
  .object({
    id: repeated(PrintIdSchema).optional(),
    labelId: repeated(z.string().trim().min(1)).optional(),
    labelName: repeated(z.string().trim().min(1)).optional(),
    labelVersion: repeated(z.string().trim().min(1)).optional(),
    limit: QueryIntegerSchema.pipe(z.number().positive()).optional(),
    offset: QueryIntegerSchema.pipe(z.number().nonnegative()).optional(),
    printerId: repeated(PrintIdSchema).optional(),
    printerIdIsNull: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    printerName: repeated(z.string().trim().min(1)).optional(),
    sort: repeated(SortEntrySchema).optional(),
    triggeredBy: repeated(z.string().trim().min(1)).optional(),
  })
  .refine(({ limit, offset }) => offset === undefined || limit !== undefined, {
    message: "limit is required when offset is provided",
    path: ["limit"],
  });

const CreatePrintSchema = z
  .object({
    labelId: z.string().trim().min(1).max(255),
    printerName: z.string().trim().min(1).max(255),
  })
  .strict();

const jsonResponse = (schema: z.ZodType, description: string): ResponsesWithResolver[string] => ({
  content: { "application/json": { schema: resolver(schema) } },
  description,
});

const errorResponses: ResponsesWithResolver = {
  400: jsonResponse(ErrorSchema, "Invalid request"),
  404: jsonResponse(ErrorSchema, "Label or print not found"),
  415: jsonResponse(ErrorSchema, "Unsupported content type"),
  500: jsonResponse(ErrorSchema, "Internal server error"),
};

type ValidationResult = { success: boolean; error?: readonly { message: string }[] };

const validationHook = (result: ValidationResult, c: Context): Response | undefined => {
  if (!result.success) return c.json({ error: { message: result.error?.[0]?.message ?? "Invalid request" } }, 400);
};

const unwrap = <T>(result: Result<T, Error>): T => {
  if (result.isOk) return result.value;
  const notFound = isNotFoundError(result.error);
  throw new HTTPException(notFound ? 404 : 500, {
    message: notFound ? result.error.message : "Internal server error",
  });
};

export const createPrintsApi = (useCases: PrintsUseCases): Hono => {
  const app = new Hono();

  app.onError((failure, c): Response => {
    const status = failure instanceof HTTPException ? failure.status : 500;
    const message = failure instanceof HTTPException ? failure.message : "Internal server error";
    return c.json({ error: { message } }, status as ContentfulStatusCode);
  });

  app.get(
    "/",
    validator("query", ListPrintsQuerySchema, validationHook),
    describeRoute({
      responses: { 200: jsonResponse(PrintsResponseSchema, "Matching prints"), ...errorResponses },
      summary: "List prints",
      tags: ["Prints"],
    }),
    async (c) => {
      const { limit, offset, sort, ...filters } = c.req.valid("query");
      const input: GetPrintsInput = {
        ...filters,
        ...(limit === undefined ? {} : { pagination: { limit, offset: offset ?? 0 } }),
        ...(sort === undefined ? {} : { sorting: sort }),
      };
      return c.json({ data: unwrap(await useCases.getPrints(input)) }, 200);
    },
  );

  app.get(
    "/:id",
    validator("param", z.object({ id: PrintIdSchema }), validationHook),
    describeRoute({
      responses: { 200: jsonResponse(PrintResponseSchema, "Print"), ...errorResponses },
      summary: "Get a print",
      tags: ["Prints"],
    }),
    async (c) => c.json({ data: unwrap(await useCases.getPrint(c.req.valid("param").id)) }, 200),
  );

  app.post(
    "/",
    validator("json", CreatePrintSchema, validationHook),
    describeRoute({
      responses: { 201: jsonResponse(PrintResponseSchema, "Created print"), ...errorResponses },
      summary: "Print a label",
      tags: ["Prints"],
    }),
    async (c) => {
      const { labelId, printerName } = c.req.valid("json");
      const input = { labelId, printerName, triggeredBy: "api" };
      const localResult = await useCases.printWithLocalLookup(input);
      const result =
        !localResult.isOk && isNotFoundError(localResult.error)
          ? await useCases.printWithVendorLookup(input)
          : localResult;
      return c.json({ data: unwrap(result) }, 201);
    },
  );

  return app;
};
