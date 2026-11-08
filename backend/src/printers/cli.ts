import { defineCommand, defineGroup, type Group } from "@bunli/core";
import { z } from "zod";
import {
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
import type { Printer } from "./domain.ts";
import type { GetPrintersInput } from "./repository/interface.ts";
import type { PrinterUseCases } from "./use-cases.ts";

const SORT_KEYS = ["id", "name", "nickname", "model", "location", "serialNumber", "createdAt", "updatedAt"] as const;

const toRow = (printer: Printer): Record<string, unknown> => ({
  id: printer.id,
  location: printer.location,
  model: printer.model,
  name: printer.name,
  nickname: printer.nickname ?? "",
  serialNumber: printer.serialNumber,
});

export const createPrintersCli = (useCases: Pick<PrinterUseCases, "getPrinter" | "getPrinters">): Group =>
  defineGroup({
    commands: [
      defineCommand({
        description: "List printers",
        handler: async (args) => {
          const { flags } = args;
          const input: GetPrintersInput = {
            ...compact({
              id: flags.id,
              location: flags.location,
              model: flags.model,
              name: flags.name,
              nickname: flags.nickname,
              serialNumber: flags["serial-number"],
            }),
            ...pagination(flags.limit, flags.offset),
            ...sorting(flags.sort),
          };
          const printers = unwrap(await useCases.getPrinters(input));
          emit(args, printers, printers.map(toRow));
        },
        name: "list",
        options: {
          id: idFilterOption("Filter by printer ID (repeatable)"),
          limit: limitOption,
          location: filterOption("Filter by location (repeatable)"),
          model: filterOption("Filter by model (repeatable)"),
          name: filterOption("Filter by name (repeatable)"),
          nickname: filterOption("Filter by nickname (repeatable)"),
          offset: offsetOption,
          "serial-number": filterOption("Filter by serial number (repeatable)"),
          sort: sortOption(SORT_KEYS),
        },
      }),
      defineCommand({
        description: "Show one printer: printers get <id>",
        handler: async (args) => {
          const printer = unwrap(await useCases.getPrinter(parseIdArgument(args.positional, z.uuid())));
          emit(args, printer, toRow(printer));
        },
        name: "get",
      }),
    ],
    description: "Printers synced from the vendor",
    name: "printers",
  });
