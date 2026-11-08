import { defineCommand, defineGroup, type Group, option } from "@bunli/core";
import { z } from "zod";
import {
  booleanOption,
  compact,
  emit,
  filterOption,
  idFilterOption,
  limitOption,
  offsetOption,
  pagination,
  parseIdArgument,
  sorting,
  sortOption,
  unwrap,
} from "../cli/helpers.ts";
import type { Print } from "./domain.ts";
import type { GetPrintsInput } from "./repository/interface.ts";
import type { PrintsUseCases } from "./use-cases.ts";

const SORT_KEYS = [
  "id",
  "printerId",
  "printerName",
  "triggeredBy",
  "labelId",
  "labelName",
  "labelVersion",
  "createdAt",
  "updatedAt",
] as const;
const text = z.string().trim().min(1).max(255);

const toRow = (print: Print): Record<string, unknown> => ({
  createdAt: print.createdAt.toISOString(),
  id: print.id,
  label: print.label.name ?? print.label.id,
  printer: print.printer.name,
  printerId: print.printer.id ?? "",
  triggeredBy: print.triggeredBy,
  version: print.label.version ?? "",
});

export const createPrintsCli = (useCases: Pick<PrintsUseCases, "getPrint" | "getPrints" | "print">): Group =>
  defineGroup({
    commands: [
      defineCommand({
        description: "List prints",
        handler: async (args) => {
          const { flags } = args;
          const input: GetPrintsInput = {
            ...compact({
              id: flags.id,
              labelId: flags["label-id"],
              labelName: flags["label-name"],
              labelVersion: flags["label-version"],
              printerId: flags["printer-id"],
              printerIdIsNull: flags["printer-id-is-null"],
              printerName: flags["printer-name"],
              triggeredBy: flags["triggered-by"],
            }),
            ...pagination(flags.limit, flags.offset),
            ...sorting(flags.sort),
          };
          const prints = unwrap(await useCases.getPrints(input));
          emit(args, prints, prints.map(toRow));
        },
        name: "list",
        options: {
          id: idFilterOption("Filter by print ID (repeatable)"),
          "label-id": filterOption("Filter by label ID (repeatable)"),
          "label-name": filterOption("Filter by label name (repeatable)"),
          "label-version": filterOption("Filter by label version (repeatable)"),
          limit: limitOption,
          offset: offsetOption,
          "printer-id": idFilterOption("Filter by printer ID (repeatable)"),
          "printer-id-is-null": booleanOption("Only prints with no linked printer (true) or with one (false)"),
          "printer-name": filterOption("Filter by printer name (repeatable)"),
          sort: sortOption(SORT_KEYS),
          "triggered-by": filterOption("Filter by who triggered the print (repeatable)"),
        },
      }),
      defineCommand({
        description: "Show one print: prints get <id>",
        handler: async (args) => {
          const print = unwrap(await useCases.getPrint(parseIdArgument(args.positional, z.uuid())));
          emit(args, print, toRow(print));
        },
        name: "get",
      }),
      defineCommand({
        description: "Print a label: prints create --label <id> --printer <name>",
        handler: async (args) => {
          const print = unwrap(
            await useCases.print({
              labelId: args.flags.label,
              printerName: args.flags.printer,
              triggeredBy: "cli",
            }),
          );
          emit(args, print, toRow(print));
        },
        name: "create",
        options: {
          label: option(text, { description: "ID of the label to print" }),
          printer: option(text, { description: "Name of the printer to print on" }),
        },
      }),
    ],
    description: "Print history and printing",
    name: "prints",
  });
