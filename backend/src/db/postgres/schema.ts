import { jobsTable } from "../../jobs/schema/postgres.ts";
import { labelsTable } from "../../labels/schema/postgres.ts";
import { printersTable } from "../../printers/schema/postgres.ts";

export default {
  jobs: jobsTable,
  labels: labelsTable,
  printers: printersTable,
};
