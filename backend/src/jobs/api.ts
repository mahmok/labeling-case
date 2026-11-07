import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResponsesWithResolver } from "hono-openapi";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Result } from "../utils/result.ts";
import type { Job } from "./domain.ts";
import type { JobSortKey } from "./repository/interface.ts";
import type { JobsUseCases } from "./use-cases.ts";

const JobTypeSchema = z.enum(["sync-printers", "sync-labels"]);
const JobIdSchema = z.uuid();
const JobSchema = z.object({
  attempts: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable().optional(),
  id: JobIdSchema,
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  startedAt: z.iso.datetime().nullable(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  triggeredBy: z.string(),
  type: z.string(),
  updatedAt: z.iso.datetime(),
});
const JobResponseSchema = z.object({ data: JobSchema });
const JobsResponseSchema = z.object({ data: z.array(JobSchema) });
const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });
const CreateJobSchema = z.object({ type: JobTypeSchema }).strict();
const IntegerQuerySchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().max(Number.MAX_SAFE_INTEGER));
const SortEntrySchema = z
  .string()
  .regex(/^[+-](id|type|status|attempts|createdAt|updatedAt|startedAt|triggeredBy)$/, "sort must use +key or -key")
  .transform((value) => ({
    direction: value.startsWith("+") ? ("ASC" as const) : ("DESC" as const),
    key: value.slice(1) as JobSortKey,
  }));

const repeated = <T extends z.ZodType>(schema: T): z.ZodType<z.output<T>[], z.input<T> | z.input<T>[]> =>
  z.union([schema, z.array(schema)]).transform((value) => (Array.isArray(value) ? value : [value]));

const ListJobsQuerySchema = z
  .object({
    limit: IntegerQuerySchema.pipe(z.number().positive()).optional(),
    offset: IntegerQuerySchema.pipe(z.number().nonnegative()).optional(),
    sort: repeated(SortEntrySchema).optional(),
    status: repeated(z.enum(["pending", "in_progress", "completed", "failed"])).optional(),
    type: repeated(JobTypeSchema).optional(),
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
  404: jsonResponse(ErrorSchema, "Job not found"),
  415: jsonResponse(ErrorSchema, "Unsupported content type"),
  500: jsonResponse(ErrorSchema, "Internal server error"),
};

type ValidationResult = { success: boolean; error?: readonly { message: string }[] };

const validationHook = (result: ValidationResult, c: Context): Response | undefined => {
  if (!result.success) return c.json({ error: { message: result.error?.[0]?.message ?? "Invalid request" } }, 400);
};

const unwrapJobs = (result: Result<Job[], Error>): Job[] => {
  if (result.isOk) return result.value;
  throw new HTTPException(500, { message: "Internal server error" });
};

export const createJobsApi = (useCases: JobsUseCases): Hono => {
  const app = new Hono();

  app.onError((failure, c): Response => {
    const status = failure instanceof HTTPException ? failure.status : 500;
    const message = failure instanceof HTTPException ? failure.message : "Internal server error";
    return c.json({ error: { message } }, status as ContentfulStatusCode);
  });

  app.get(
    "/",
    validator("query", ListJobsQuerySchema, validationHook),
    describeRoute({
      responses: { 200: jsonResponse(JobsResponseSchema, "Jobs"), ...errorResponses },
      summary: "List jobs",
      tags: ["Jobs"],
    }),
    async (c) => {
      const { limit, offset, sort, ...filters } = c.req.valid("query");
      const result = await useCases.getJobs({
        ...filters,
        pagination: { limit: limit ?? 50, offset: offset ?? 0 },
        sorting: sort ?? [{ direction: "DESC", key: "createdAt" }],
      });
      return c.json({ data: unwrapJobs(result) }, 200);
    },
  );

  app.get(
    "/:id",
    validator("param", z.object({ id: JobIdSchema }), validationHook),
    describeRoute({
      responses: { 200: jsonResponse(JobResponseSchema, "Job"), ...errorResponses },
      summary: "Get a job",
      tags: ["Jobs"],
    }),
    async (c) => {
      const [job] = unwrapJobs(await useCases.getJobs({ id: [c.req.valid("param").id] }));
      if (!job) throw new HTTPException(404, { message: "Job was not found" });
      return c.json({ data: job }, 200);
    },
  );

  app.post(
    "/",
    validator("json", CreateJobSchema, validationHook),
    describeRoute({
      responses: { 202: jsonResponse(JobResponseSchema, "Job queued"), ...errorResponses },
      summary: "Trigger a job",
      tags: ["Jobs"],
    }),
    async (c) => {
      const { type } = c.req.valid("json");
      const [job] = unwrapJobs(await useCases.createJobs([{ triggeredBy: "api", type }]));
      if (!job) throw new HTTPException(500, { message: "Job repository returned no created job" });
      return c.json({ data: job }, 202);
    },
  );

  return app;
};
