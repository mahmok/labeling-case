import { createPrintLookupMethods } from "./application/print-lookups.ts";
import { createDatabase, type Database } from "./db";
import type { UnitOfWork } from "./db/unit-of-work.ts";
import type { JobsRepository } from "./jobs";
import { createJobUseCases, type JobsUseCases, fromDialect as jobsFromDialect } from "./jobs";
import { createLabelUseCases, type LabelUseCases } from "./labels";
import { MockClient as MockLabelsClient } from "./labels/client/mock.ts";
import { fromDialect as labelsFromDialect } from "./labels/repository";
import type { LabelsRepository } from "./labels/repository/interface.ts";
import { createPrinterUseCases, type PrinterUseCases } from "./printers";
import { MockClient as MockPrintersClient } from "./printers/client/mock.ts";
import { fromDialect as printersFromDialect } from "./printers/repository";
import type { PrintersRepository } from "./printers/repository/interface.ts";
import { createPrintsUseCases, type PrintsUseCases } from "./prints";
import { MockClient as MockPrintsClient } from "./prints/client/mock.ts";
import { fromDialect as printsFromDialect } from "./prints/repository";
import type { PrintsRepository } from "./prints/repository/interface.ts";

export type ApplicationUseCases = {
  jobs: JobsUseCases;
  labels: LabelUseCases;
  printers: PrinterUseCases;
  prints: PrintsUseCases;
};

export type Application = {
  db: Database;
  useCases: ApplicationUseCases;
};

type ApplicationRepositories<T> = {
  jobs: JobsRepository<T>;
  labels: LabelsRepository<T>;
  printers: PrintersRepository<T>;
  prints: PrintsRepository<T>;
};

const buildUseCases = <T>(uow: UnitOfWork<T>, repositories: ApplicationRepositories<T>): ApplicationUseCases => {
  const jobs = createJobUseCases({ repository: repositories.jobs, uow });
  const labels = createLabelUseCases({ client: MockLabelsClient, repository: repositories.labels, uow });
  const printers = createPrinterUseCases({ client: MockPrintersClient, repository: repositories.printers, uow });
  const prints = createPrintsUseCases({
    ...createPrintLookupMethods({ labels, printers }),
    client: MockPrintsClient,
    repository: repositories.prints,
    uow,
  });

  return { jobs, labels, printers, prints };
};

const createUseCases = async (db: Database): Promise<ApplicationUseCases> => {
  switch (db.dialect) {
    case "postgresql":
      return buildUseCases(db.uow, {
        jobs: await jobsFromDialect("postgresql"),
        labels: await labelsFromDialect("postgresql"),
        printers: await printersFromDialect("postgresql"),
        prints: await printsFromDialect("postgresql"),
      });
    case "sqlite":
      return buildUseCases(db.uow, {
        jobs: await jobsFromDialect("sqlite"),
        labels: await labelsFromDialect("sqlite"),
        printers: await printersFromDialect("sqlite"),
        prints: await printsFromDialect("sqlite"),
      });
  }
};

export const createApplication = async (database?: Database): Promise<Application> => {
  const db = database ?? (await createDatabase());
  const useCases = await createUseCases(db);
  return { db, useCases };
};
