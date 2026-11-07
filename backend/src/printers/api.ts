import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResponsesWithResolver } from "hono-openapi";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Result } from "../utils/result.ts";
import type { GetPrintersInput } from "./repository/interface.ts";
import { PrinterNotFoundError, type PrinterUseCases } from "./use-cases.ts";

const PrinterSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
  location: z.string(),
  model: z.string(),
  name: z.string(),
  nickname: z.string().nullable(),
  serialNumber: z.string(),
  updatedAt: z.iso.datetime(),
});
const PrinterResponseSchema = z.object({ data: PrinterSchema });
const PrintersResponseSchema = z.object({ data: z.array(PrinterSchema) });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const printerText = z.string().trim().min(1).max(255);
const CreatePrinterSchema = z
  .object({
    location: printerText,
    model: printerText,
    name: printerText,
    nickname: printerText.optional(),
    serialNumber: printerText,
  })
  .strict();
const UpdatePrinterSchema = CreatePrinterSchema.extend({ nickname: printerText.nullable().optional() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one printer field must be provided",
  });
const PrinterIdSchema = z.uuid();
const QueryIntegerSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));
const SortEntrySchema = z
  .string()
  .regex(/^[+-](id|name|nickname|model|location|serialNumber|createdAt|updatedAt)$/, "sort must use +key or -key")
  .transform((value) => ({
    direction: value.startsWith("+") ? ("ASC" as const) : ("DESC" as const),
    key: value.slice(1) as NonNullable<GetPrintersInput["sorting"]>[number]["key"],
  }));

const repeated = <T extends z.ZodType>(schema: T): z.ZodType<z.output<T>[], z.input<T> | z.input<T>[]> =>
  z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));

const ListPrintersQuerySchema = z
  .object({
    id: repeated(PrinterIdSchema).optional(),
    limit: QueryIntegerSchema.pipe(z.number().positive()).optional(),
    location: repeated(z.string().trim().min(1)).optional(),
    model: repeated(z.string().trim().min(1)).optional(),
    name: repeated(z.string().trim().min(1)).optional(),
    nickname: repeated(z.string().trim().min(1)).optional(),
    offset: QueryIntegerSchema.pipe(z.number().nonnegative()).optional(),
    serialNumber: repeated(z.string().trim().min(1)).optional(),
    sort: repeated(SortEntrySchema).optional(),
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
  404: jsonResponse(ErrorSchema, "Printer not found"),
  415: jsonResponse(ErrorSchema, "Unsupported content type"),
  500: jsonResponse(ErrorSchema, "Internal server error"),
};

type ValidationResult = { success: boolean; error?: readonly { message: string }[] };

const validationHook = (result: ValidationResult, c: Context): Response | undefined => {
  if (!result.success) {
    return c.json({ error: { message: result.error?.[0]?.message ?? "Invalid request" } }, 400);
  }
};

const unwrap = <T>(result: Result<T, Error>): T => {
  if (result.isOk) return result.value;

  const notFound = result.error instanceof PrinterNotFoundError;
  throw new HTTPException(notFound ? 404 : 500, {
    message: notFound ? result.error.message : "Internal server error",
  });
};

export const createPrintersApi = (useCases: PrinterUseCases): Hono => {
  const app = new Hono();

  app.onError((failure, c): Response => {
    const status = failure instanceof HTTPException ? failure.status : 500;
    const message = failure instanceof HTTPException ? failure.message : "Internal server error";
    return c.json({ error: { message } }, status as ContentfulStatusCode);
  });

  app.get(
    "/",
    validator("query", ListPrintersQuerySchema, validationHook),
    describeRoute({
      responses: {
        200: jsonResponse(PrintersResponseSchema, "Matching printers"),
        ...errorResponses,
      },
      summary: "List printers",
      tags: ["Printers"],
    }),
    async (c) => {
      const { limit, offset, sort, ...filters } = c.req.valid("query");
      const input: GetPrintersInput = {
        ...filters,
        ...(limit === undefined ? {} : { pagination: { limit, offset: offset ?? 0 } }),
        ...(sort === undefined ? {} : { sorting: sort }),
      };
      return c.json({ data: unwrap(await useCases.getPrinters(input)) }, 200);
    },
  );

  app.get(
    "/:id",
    validator("param", z.object({ id: PrinterIdSchema }), validationHook),
    describeRoute({
      responses: {
        200: jsonResponse(PrinterResponseSchema, "Printer"),
        ...errorResponses,
      },
      summary: "Get a printer",
      tags: ["Printers"],
    }),
    async (c) => c.json({ data: unwrap(await useCases.getPrinter(c.req.valid("param").id)) }, 200),
  );

  app.post(
    "/",
    validator("json", CreatePrinterSchema, validationHook),
    describeRoute({
      responses: {
        201: jsonResponse(PrinterResponseSchema, "Created printer"),
        ...errorResponses,
      },
      summary: "Create a printer",
      tags: ["Printers"],
    }),
    async (c) => c.json({ data: unwrap(await useCases.createPrinter(c.req.valid("json"))) }, 201),
  );

  app.patch(
    "/:id",
    validator("param", z.object({ id: PrinterIdSchema }), validationHook),
    validator("json", UpdatePrinterSchema, validationHook),
    describeRoute({
      responses: {
        200: jsonResponse(PrinterResponseSchema, "Updated printer"),
        ...errorResponses,
      },
      summary: "Update a printer",
      tags: ["Printers"],
    }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json({ data: unwrap(await useCases.updatePrinter({ id, ...c.req.valid("json") })) }, 200);
    },
  );

  app.delete(
    "/:id",
    validator("param", z.object({ id: PrinterIdSchema }), validationHook),
    describeRoute({
      responses: { 204: { description: "Printer deleted" }, ...errorResponses },
      summary: "Delete a printer",
      tags: ["Printers"],
    }),
    async (c) => {
      unwrap(await useCases.deletePrinter(c.req.valid("param").id));
      return c.body(null, 204);
    },
  );

  return app;
};
