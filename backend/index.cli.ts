import "./src/cli/env.ts";
import { createCLI } from "@bunli/core";
import { createApplication } from "./src/application.ts";
import { config } from "./src/config.ts";
import { createJobsCli } from "./src/jobs/cli.ts";
import { createLabelsCli } from "./src/labels/cli.ts";
import { createPrintersCli } from "./src/printers/cli.ts";
import { createPrintsCli } from "./src/prints/cli.ts";

void (async () => {
  if (config.database.dialect !== "postgresql") {
    process.stderr.write("The CLI needs a PostgreSQL database. Set DATABASE_DIALECT=postgresql.\n");
    process.exit(1);
  }

  const application = await createApplication();
  try {
    const cli = await createCLI({
      description: "Query and operate the labeling platform from the command line",
      name: "labeling",
      version: "0.1.0",
    });
    const { jobs, labels, printers, prints } = application.useCases;
    cli.command(createPrintersCli(printers));
    cli.command(createLabelsCli(labels));
    cli.command(createPrintsCli(prints));
    cli.command(createJobsCli(jobs));
    await cli.run();
  } finally {
    await application.db.close();
  }
})();
