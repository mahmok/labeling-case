import { type CLIOption, formatOutput, type OutputFormat, option } from "@bunli/core";
import { z } from "zod";
import type { Result } from "../utils/result.ts";

export type OutputContext = {
  output: (data: unknown) => void;
  format: OutputFormat;
  formatExplicit: boolean;
  agent: boolean;
};

export type SortDirection = "ASC" | "DESC";
export type SortEntry<K extends string> = { key: K; direction: SortDirection };

const text = z.string().trim().min(1);

export const unwrap = <T>(result: Result<T, Error>): T => {
  if (result.isOk) return result.value;
  throw result.error;
};

export const parseIdArgument = (positional: string[], schema: z.ZodType<string>, name = "id"): string => {
  const [value] = positional;
  if (value === undefined) throw new Error(`Missing <${name}> argument`);
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid <${name}>: ${parsed.error.issues[0]?.message ?? "invalid value"}`);
  return parsed.data;
};

export const compact = <T extends Record<string, unknown>>(values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;

export const pagination = (
  limit: number | undefined,
  offset: number | undefined,
): { pagination?: { limit: number; offset: number } } => {
  if (limit === undefined) {
    if (offset !== undefined) throw new Error("--limit is required when --offset is provided");
    return {};
  }
  return { pagination: { limit, offset: offset ?? 0 } };
};

export const sorting = <K extends string>(entries: SortEntry<K>[] | undefined): { sorting?: SortEntry<K>[] } =>
  entries === undefined ? {} : { sorting: entries };

type StringListSchema = z.ZodOptional<z.ZodArray<z.ZodType<string>>>;
type BooleanSchema = z.ZodOptional<z.ZodPipe<z.ZodEnum<{ true: "true"; false: "false" }>, z.ZodTransform<boolean>>>;
type BooleanListSchema = z.ZodOptional<
  z.ZodArray<z.ZodPipe<z.ZodEnum<{ true: "true"; false: "false" }>, z.ZodTransform<boolean>>>
>;

const toBoolean = (value: "true" | "false"): boolean => value === "true";

export const filterOption = (description: string): CLIOption<StringListSchema> =>
  option(z.array(text).optional(), { description, repeatable: true });

export const idFilterOption = (
  description: string,
  schema: z.ZodType<string> = z.uuid(),
): CLIOption<StringListSchema> => option(z.array(schema).optional(), { description, repeatable: true });

export const booleanFilterOption = (description: string): CLIOption<BooleanListSchema> =>
  option(z.array(z.enum(["true", "false"]).transform(toBoolean)).optional(), { description, repeatable: true });

export const booleanOption = (description: string): CLIOption<BooleanSchema> =>
  option(z.enum(["true", "false"]).transform(toBoolean).optional(), { description });

export const limitOption = option(z.coerce.number().int().positive().optional(), {
  description: "Maximum number of results",
});

export const offsetOption = option(z.coerce.number().int().nonnegative().optional(), {
  description: "Number of results to skip (requires --limit)",
});

const PREFIXED_SORT = /^([+-])(.+)$/;
const SUFFIXED_SORT = /^(.+):(asc|desc)$/;

const parseSortEntry = <K extends string>(value: string): SortEntry<K> => {
  const prefixed = PREFIXED_SORT.exec(value);
  const suffixed = SUFFIXED_SORT.exec(value);
  if (prefixed) return { direction: prefixed[1] === "+" ? "ASC" : "DESC", key: prefixed[2] as K };
  if (suffixed) return { direction: suffixed[2] === "asc" ? "ASC" : "DESC", key: suffixed[1] as K };
  return { direction: "ASC", key: value as K };
};

export const sortOption = <K extends string>(
  keys: readonly K[],
): CLIOption<z.ZodOptional<z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<SortEntry<K>>>>>> =>
  option(
    z
      .array(
        z
          .string()
          .regex(
            new RegExp(`^[+-]?(${keys.join("|")})(:(asc|desc))?$`),
            `sort must be one of: ${keys.join(", ")} (optionally name:asc, name:desc, +name or -name)`,
          )
          .transform((value): SortEntry<K> => parseSortEntry<K>(value)),
      )
      .optional(),
    { description: `Sort by: ${keys.join(", ")} (for example createdAt:desc)`, repeatable: true },
  );

const writeLine = (value: string): void => {
  process.stdout.write(`${value}\n`);
};

export const emit = (
  context: OutputContext,
  data: unknown,
  rows?: Record<string, unknown>[] | Record<string, unknown>,
): void => {
  const plain: unknown = JSON.parse(JSON.stringify(data));
  const format = !(context.formatExplicit || context.agent) ? "md" : context.format;

  if (format !== "md") {
    context.output(plain);
    return;
  }
  const table: unknown = rows === undefined ? plain : JSON.parse(JSON.stringify(rows));
  if (Array.isArray(table) && table.length === 0) {
    writeLine("No results.");
    return;
  }
  writeLine(formatOutput(table, "md"));
};
