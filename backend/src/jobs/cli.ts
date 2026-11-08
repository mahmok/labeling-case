import { defineCommand, defineGroup, type Group, option } from "@bunli/core";
import { z } from "zod";
import {
  compact,
  emit,
  idFilterOption,
  limitOption,
  offsetOption,
  pagination,
  parseIdArgument,
  sorting,
  sortOption,
  unwrap,
} from "../cli/helpers.ts";
import type { Job, JobStatus } from "./domain.ts";
import type { GetJobsInput, JobSortKey } from "./repository/interface.ts";
import type { JobsUseCases } from "./use-cases.ts";

const JOB_TYPES = ["sync-printers", "sync-labels", "backfill-prints"] as const;
const JOB_STATUSES = ["pending", "in_progress", "completed", "failed"] as const satisfies readonly JobStatus[];
const SORT_KEYS: readonly JobSortKey[] = [
  "id",
  "type",
  "status",
  "attempts",
  "createdAt",
  "updatedAt",
  "startedAt",
  "triggeredBy",
];
const JobTypeSchema = z.enum(JOB_TYPES);

const toRow = (job: Job): Record<string, unknown> => ({
  attempts: job.attempts,
  createdAt: job.createdAt.toISOString(),
  durationMs: job.durationMs ?? "",
  id: job.id,
  status: job.status,
  triggeredBy: job.triggeredBy,
  type: job.type,
});

export const createJobsCli = (useCases: Pick<JobsUseCases, "createJobs" | "getJobs">): Group =>
  defineGroup({
    commands: [
      defineCommand({
        description: "List jobs",
        handler: async (args) => {
          const { flags } = args;
          const input: GetJobsInput = {
            ...compact({ id: flags.id, status: flags.status, type: flags.type }),
            ...pagination(flags.limit, flags.offset),
            ...sorting(flags.sort),
          };
          const jobs = unwrap(await useCases.getJobs(input));
          emit(args, jobs, jobs.map(toRow));
        },
        name: "list",
        options: {
          id: idFilterOption("Filter by job ID (repeatable)"),
          limit: limitOption,
          offset: offsetOption,
          sort: sortOption(SORT_KEYS),
          status: option(z.array(z.enum(JOB_STATUSES)).optional(), {
            description: `Filter by status: ${JOB_STATUSES.join(", ")} (repeatable)`,
            repeatable: true,
          }),
          type: option(z.array(JobTypeSchema).optional(), {
            description: `Filter by type: ${JOB_TYPES.join(", ")} (repeatable)`,
            repeatable: true,
          }),
        },
      }),
      defineCommand({
        description: "Show one job with its result or error: jobs get <id>",
        handler: async (args) => {
          const [job] = unwrap(await useCases.getJobs({ id: [parseIdArgument(args.positional, z.uuid())] }));
          if (!job) throw new Error(`Job ${args.positional[0]} was not found`);
          emit(args, job, { ...toRow(job), error: job.error ?? "", result: JSON.stringify(job.result ?? null) });
        },
        name: "get",
      }),
      defineCommand({
        description: `Queue a job for the worker: jobs create <${JOB_TYPES.join("|")}>. The worker must be running to execute it.`,
        handler: async (args) => {
          const type = parseIdArgument(args.positional, JobTypeSchema, "type");
          const [job] = unwrap(await useCases.createJobs([{ triggeredBy: "cli", type }]));
          if (!job) throw new Error("The job was not created");
          emit(args, job, toRow(job));
        },
        name: "create",
      }),
    ],
    description: "Background jobs",
    name: "jobs",
  });
