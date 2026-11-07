import { createDatabase, type Database } from "./db";
import { createJobUseCases, type JobsUseCases, fromDialect as jobsFromDialect } from "./jobs";
import { createLabelUseCases, type LabelUseCases } from "./labels";
import { MockClient as MockLabelsClient } from "./labels/client/mock.ts";
import { fromDialect as labelsFromDialect } from "./labels/repository";
import { createPrinterUseCases, type PrinterUseCases } from "./printers";
import { MockClient as MockPrintersClient } from "./printers/client/mock.ts";
import { fromDialect as printersFromDialect } from "./printers/repository";

export type ApplicationUseCases = {
  jobs: JobsUseCases;
  labels: LabelUseCases;
  printers: PrinterUseCases;
};

export type Application = {
  db: Database;
  useCases: ApplicationUseCases;
};

const createUseCases = async (db: Database): Promise<ApplicationUseCases> => {
  switch (db.dialect) {
    case "postgresql":
      return {
        jobs: createJobUseCases({ repository: await jobsFromDialect("postgresql"), uow: db.uow }),
        labels: createLabelUseCases({
          client: MockLabelsClient,
          repository: await labelsFromDialect("postgresql"),
          uow: db.uow,
        }),
        printers: createPrinterUseCases({
          client: MockPrintersClient,
          repository: await printersFromDialect("postgresql"),
          uow: db.uow,
        }),
      };
    case "sqlite":
      return {
        jobs: createJobUseCases({ repository: await jobsFromDialect("sqlite"), uow: db.uow }),
        labels: createLabelUseCases({
          client: MockLabelsClient,
          repository: await labelsFromDialect("sqlite"),
          uow: db.uow,
        }),
        printers: createPrinterUseCases({
          client: MockPrintersClient,
          repository: await printersFromDialect("sqlite"),
          uow: db.uow,
        }),
      };
  }
};

export const createApplication = async (database?: Database): Promise<Application> => {
  const db = database ?? (await createDatabase());
  const useCases = await createUseCases(db);
  return { db, useCases };
};
