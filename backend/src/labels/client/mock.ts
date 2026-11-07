import { ok, type Result } from "../../utils/result.ts";
import type { GetLabelsRequest, GetLabelsResponse, LabelsClient } from "./interface.ts";

export const get = async (_request: GetLabelsRequest): Promise<Result<GetLabelsResponse, Error>> => {
  return ok([
    { id: "lbl-001", name: "Fragile", version: 1 },
    { id: "lbl-002", name: "Handle With Care", version: 1 },
    { id: "lbl-003", name: "This Side Up", version: 2 },
    { id: "lbl-004", name: "Keep Dry", version: 1 },
    { id: "lbl-005", name: "Refrigerate", version: 1 },
    { id: "lbl-006", name: "Frozen Goods", version: 3 },
    { id: "lbl-007", name: "Perishable", version: 1 },
    { id: "lbl-008", name: "Express Delivery", version: 2 },
    { id: "lbl-009", name: "Return to Sender", version: 1 },
    { id: "lbl-010", name: "Quality Approved", version: 1 },
    { id: "lbl-011", name: "Inspected", version: 2 },
    { id: "lbl-012", name: "Do Not Stack", version: 1 },
    { id: "lbl-013", name: "Limited Quantity", version: 1 },
    { id: "lbl-014", name: "Made in Denmark", version: 2 },
    { id: "lbl-015", name: "Best Before", version: 1 },
  ]);
};

export const MockClient: LabelsClient = {
  get,
};
