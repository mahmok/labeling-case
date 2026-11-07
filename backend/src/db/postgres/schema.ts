import { labelsTable } from "../../labels/schema/postgres.ts";
import { printersTable } from "../../printers/schema/postgres.ts";

export default {
  labels: labelsTable,
  printers: printersTable,
};
