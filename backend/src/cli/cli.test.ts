import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCLI, type Group } from "@bunli/core";
import { createJobsCli } from "../jobs/cli.ts";
import type { Job } from "../jobs";
import type { GetJobsInput } from "../jobs";
import { createLabelsCli } from "../labels/cli.ts";
import type { GetLabelsInput } from "../labels/repository/interface.ts";
import { createPrintersCli } from "../printers/cli.ts";
import type { GetPrintersInput } from "../printers/repository/interface.ts";
import { createPrintsCli } from "../prints/cli.ts";
import type { Print } from "../prints";
import type { GetPrintsInput } from "../prints/repository/interface.ts";
import type { PrintInput } from "../prints";
import { ok } from "../utils/result.ts";

const runCli = async (group: Group, args: string[]): Promise<string> => {
  const written: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    written.push(String(chunk));
    return true;
  };
  try {
    const cli = await createCLI({ name: "labeling", version: "0.0.0" });
    cli.command(group);
    await cli.run(args);
  } finally {
    process.stdout.write = originalWrite;
  }
  return written.join("");
};

const aPrint = (): Print => ({
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  id: "01a1b8db-1b80-7000-9b2c-4f12ad3fe08c",
  label: { id: "lbl-001", name: null, version: null },
  printer: { id: null, name: "Office Printer" },
  triggeredBy: "cli",
  updatedAt: new Date("2026-01-02T03:04:05.000Z"),
});

const aJob = (): Job => ({
  attempts: 0,
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  durationMs: null,
  id: "01a1b8db-1b80-7000-9b2c-4f12ad3fe08c",
  startedAt: null,
  status: "pending",
  triggeredBy: "cli",
  type: "sync-labels",
  updatedAt: new Date("2026-01-02T03:04:05.000Z"),
});

describe("CLI commands", () => {
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = exitCode;
  });

  test("printers list turns flags into the use case input", async () => {
    let received: GetPrintersInput | undefined;
    const group = createPrintersCli({
      getPrinter: async () => {
        throw new Error("not used by this test");
      },
      getPrinters: async (input: GetPrintersInput) => {
        received = input;
        return ok([]);
      },
    });

    await runCli(group, [
      "printers",
      "list",
      "--name",
      "Office Printer",
      "--name",
      "Marketing Printer",
      "--serial-number",
      "SN1",
      "--sort",
      "name:desc",
      "--sort",
      "+model",
      "--limit",
      "5",
      "--offset",
      "10",
      "--format",
      "json",
    ]);

    expect(received).toEqual({
      name: ["Office Printer", "Marketing Printer"],
      pagination: { limit: 5, offset: 10 },
      serialNumber: ["SN1"],
      sorting: [
        { direction: "DESC", key: "name" },
        { direction: "ASC", key: "model" },
      ],
    });
  });

  test("labels list parses the primary filter into booleans", async () => {
    let received: GetLabelsInput | undefined;
    const group = createLabelsCli({
      getLabel: async () => {
        throw new Error("not used by this test");
      },
      getLabels: async (input: GetLabelsInput) => {
        received = input;
        return ok([]);
      },
    });

    await runCli(group, ["labels", "list", "--is-primary", "true", "--label-version", "2", "--format", "json"]);

    expect(received).toEqual({ isPrimary: [true], version: ["2"] });
  });

  test("prints list passes the printer filter flags through", async () => {
    let received: GetPrintsInput | undefined;
    const group = createPrintsCli({
      getPrint: async () => ok(aPrint()),
      getPrints: async (input: GetPrintsInput) => {
        received = input;
        return ok([aPrint()]);
      },
      print: async () => ok(aPrint()),
    });

    const output = await runCli(group, ["prints", "list", "--printer-id-is-null", "true", "--format", "json"]);

    expect(received).toEqual({ printerIdIsNull: true });
    expect(JSON.parse(output)).toMatchObject([{ id: aPrint().id, triggeredBy: "cli" }]);
  });

  test("prints create sends the print as the cli", async () => {
    let received: PrintInput | undefined;
    const group = createPrintsCli({
      getPrint: async () => ok(aPrint()),
      getPrints: async () => ok([]),
      print: async (input: PrintInput) => {
        received = input;
        return ok(aPrint());
      },
    });

    await runCli(group, ["prints", "create", "--label", "lbl-001", "--printer", "Office Printer", "--format", "json"]);

    expect(received).toEqual({ labelId: "lbl-001", printerName: "Office Printer", triggeredBy: "cli" });
  });

  test("jobs list filters by type and status", async () => {
    let received: GetJobsInput | undefined;
    const group = createJobsCli({
      createJobs: async () => ok([aJob()]),
      getJobs: async (input: GetJobsInput) => {
        received = input;
        return ok([]);
      },
    });

    await runCli(group, ["jobs", "list", "--type", "sync-labels", "--status", "failed", "--format", "json"]);

    expect(received).toEqual({ status: ["failed"], type: ["sync-labels"] });
  });

  test("jobs create queues the job as the cli", async () => {
    let received: { type: string; triggeredBy?: string }[] | undefined;
    const group = createJobsCli({
      createJobs: async (inputs: { type: string; triggeredBy?: string }[]) => {
        received = inputs;
        return ok([aJob()]);
      },
      getJobs: async () => ok([]),
    });

    const output = await runCli(group, ["jobs", "create", "sync-labels", "--format", "json"]);

    expect(received).toEqual([{ triggeredBy: "cli", type: "sync-labels" }]);
    expect(JSON.parse(output)).toMatchObject({ status: "pending", triggeredBy: "cli" });
  });

  test("table output flattens nested values into columns", async () => {
    const group = createPrintsCli({
      getPrint: async () => ok(aPrint()),
      getPrints: async () => ok([aPrint()]),
      print: async () => ok(aPrint()),
    });

    const output = await runCli(group, ["prints", "list", "--format", "md"]);

    expect(output).toContain("| id");
    expect(output).toContain("lbl-001");
    expect(output).not.toContain("[object Object]");
  });
});
