import { defineCommand, defineGroup, type Group } from "@bunli/core";
import { z } from "zod";
import {
  booleanFilterOption,
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
import type { Label } from "./domain.ts";
import type { GetLabelsInput } from "./repository/interface.ts";
import type { LabelUseCases } from "./use-cases.ts";

const SORT_KEYS = ["id", "name", "nickname", "version", "isPrimary"] as const;
const LabelIdSchema = z.string().trim().min(1).max(255);

const toRow = (label: Label): Record<string, unknown> => ({
  id: label.id,
  name: label.name,
  nickname: label.nickname ?? "",
  primary: label.isPrimary,
  version: label.version,
});

export const createLabelsCli = (useCases: Pick<LabelUseCases, "getLabel" | "getLabels">): Group =>
  defineGroup({
    commands: [
      defineCommand({
        description: "List labels",
        handler: async (args) => {
          const { flags } = args;
          const input: GetLabelsInput = {
            ...compact({
              id: flags.id,
              isPrimary: flags["is-primary"],
              name: flags.name,
              nickname: flags.nickname,
              version: flags["label-version"],
            }),
            ...pagination(flags.limit, flags.offset),
            ...sorting(flags.sort),
          };
          const labels = unwrap(await useCases.getLabels(input));
          emit(args, labels, labels.map(toRow));
        },
        name: "list",
        options: {
          id: idFilterOption("Filter by label ID (repeatable)", LabelIdSchema),
          "is-primary": booleanFilterOption("Filter by primary status: true or false (repeatable)"),
          "label-version": filterOption("Filter by version (repeatable)"),
          limit: limitOption,
          name: filterOption("Filter by name (repeatable)"),
          nickname: filterOption("Filter by nickname (repeatable)"),
          offset: offsetOption,
          sort: sortOption(SORT_KEYS),
        },
      }),
      defineCommand({
        description: "Show one label: labels get <id>",
        handler: async (args) => {
          const label = unwrap(await useCases.getLabel(parseIdArgument(args.positional, LabelIdSchema)));
          emit(args, label, toRow(label));
        },
        name: "get",
      }),
    ],
    description: "Labels synced from the vendor",
    name: "labels",
  });
