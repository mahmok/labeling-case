import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResponsesWithResolver } from "hono-openapi";
import { describeRoute, resolver, validator } from "hono-openapi";
import { type ZodString, z } from "zod";
import { isNotFoundError } from "../utils/errors.ts";
import type { Result } from "../utils/result.ts";
import type { GetLabelsInput } from "./repository/interface.ts";
import type { LabelUseCases } from "./use-cases.ts";

const LabelSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string(),
  isPrimary: z.boolean(),
  name: z.string(),
  nickname: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  version: z.string(),
});
const LabelResponseSchema = z.object({ data: LabelSchema });
const LabelsResponseSchema = z.object({ data: z.array(LabelSchema) });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const labelText = z.string().trim().min(1).max(255);
const CreateLabelSchema = z
  .object({
    id: labelText,
    isPrimary: z.boolean(),
    name: labelText,
    nickname: labelText.optional(),
    version: labelText,
  })
  .strict();
const UpdateLabelSchema = z
  .object({ isPrimary: z.boolean().optional(), nickname: labelText.nullable().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one label field must be provided",
  });
const LabelIdSchema: ZodString = labelText;
const QueryIntegerSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));
const SortEntrySchema = z
  .string()
  .regex(/^[+-](id|name|nickname|version|isPrimary)$/, "sort must use +key or -key")
  .transform((value) => ({
    direction: value.startsWith("+") ? ("ASC" as const) : ("DESC" as const),
    key: value.slice(1) as NonNullable<GetLabelsInput["sorting"]>[number]["key"],
  }));

const repeated = <T extends z.ZodType>(schema: T): z.ZodType<z.output<T>[], z.input<T> | z.input<T>[]> =>
  z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));

const ListLabelsQuerySchema = z
  .object({
    id: repeated(LabelIdSchema).optional(),
    isPrimary: repeated(z.enum(["true", "false"]).transform((value) => value === "true")).optional(),
    limit: QueryIntegerSchema.pipe(z.number().positive()).optional(),
    name: repeated(z.string().trim().min(1)).optional(),
    nickname: repeated(z.string().trim().min(1)).optional(),
    offset: QueryIntegerSchema.pipe(z.number().nonnegative()).optional(),
    sort: repeated(SortEntrySchema).optional(),
    version: repeated(z.string().trim().min(1)).optional(),
  })
  .refine(({ limit, offset }) => offset === undefined || limit !== undefined, {
    message: "limit is required when offset is provided",
    path: ["limit"],
  });

const jsonResponse = (schema: z.ZodType, description: string): ResponsesWithResolver[string] => ({
  content: { "application/json": { schema: resolver(schema) } },
  description,
});

const errorResponses: ResponsesWithResolver = {
  400: jsonResponse(ErrorSchema, "Invalid request"),
  404: jsonResponse(ErrorSchema, "Label not found"),
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

export const createLabelsApi = (useCases: LabelUseCases): Hono => {
  const app = new Hono();
  app.onError((failure, c): Response => {
    const status = failure instanceof HTTPException ? failure.status : 500;
    const message = failure instanceof HTTPException ? failure.message : "Internal server error";
    return c.json({ error: { message } }, status as ContentfulStatusCode);
  });

  app.get(
    "/",
    validator("query", ListLabelsQuerySchema, validationHook),
    describeRoute({
      responses: { 200: jsonResponse(LabelsResponseSchema, "Matching labels"), ...errorResponses },
      summary: "List labels",
      tags: ["Labels"],
    }),
    async (c) => {
      const { limit, offset, sort, ...filters } = c.req.valid("query");
      const input: GetLabelsInput = {
        ...filters,
        ...(limit === undefined ? {} : { pagination: { limit, offset: offset ?? 0 } }),
        ...(sort === undefined ? {} : { sorting: sort }),
      };
      return c.json({ data: unwrap(await useCases.getLabels(input)) }, 200);
    },
  );

  app.get(
    "/:id",
    validator("param", z.object({ id: LabelIdSchema }), validationHook),
    describeRoute({
      responses: { 200: jsonResponse(LabelResponseSchema, "Label"), ...errorResponses },
      summary: "Get a label",
      tags: ["Labels"],
    }),
    async (c) => c.json({ data: unwrap(await useCases.getLabel(c.req.valid("param").id)) }, 200),
  );

  app.post(
    "/",
    validator("json", CreateLabelSchema, validationHook),
    describeRoute({
      responses: { 201: jsonResponse(LabelResponseSchema, "Created label"), ...errorResponses },
      summary: "Create a label",
      tags: ["Labels"],
    }),
    async (c) => c.json({ data: unwrap(await useCases.createLabel(c.req.valid("json"))) }, 201),
  );

  app.patch(
    "/:id",
    validator("param", z.object({ id: LabelIdSchema }), validationHook),
    validator("json", UpdateLabelSchema, validationHook),
    describeRoute({
      responses: { 200: jsonResponse(LabelResponseSchema, "Updated label"), ...errorResponses },
      summary: "Update a label",
      tags: ["Labels"],
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json({ data: unwrap(await useCases.updateLabel({ id, ...c.req.valid("json") })) }, 200);
    },
  );

  app.delete(
    "/:id",
    validator("param", z.object({ id: LabelIdSchema }), validationHook),
    describeRoute({
      responses: { 204: { description: "Label deleted" }, ...errorResponses },
      summary: "Delete a label",
      tags: ["Labels"],
    }),
    async (c) => {
      unwrap(await useCases.deleteLabel(c.req.valid("param").id));
      return c.body(null, 204);
    },
  );

  return app;
};
