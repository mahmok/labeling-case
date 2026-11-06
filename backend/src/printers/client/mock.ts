import { ok, type Result } from "../../utils/result.ts";
import type { GetPrintersRequest, GetPrintersResponse, PrintersClient } from "./interface.ts";

export const get = async (_request: GetPrintersRequest): Promise<Result<GetPrintersResponse, Error>> => {
  return ok([
    {
      model: "HP LaserJet Pro",
      name: "Office Printer",
    },
    {
      model: "Canon i-SENSYS",
      name: "Reception Printer",
    },
    {
      model: "Brother MFC-L8900CDW",
      name: "Finance Department Printer",
    },
    {
      model: "Epson WorkForce Pro WF-C5890",
      name: "HR Department Printer",
    },
    {
      model: "HP Color LaserJet Enterprise",
      name: "Marketing Printer",
    },
    {
      model: "Canon imageRUNNER ADVANCE",
      name: "Meeting Room Printer",
    },
    {
      model: "Zebra ZT411",
      name: "Warehouse Printer",
    },
    {
      model: "Brother HL-L6400DW",
      name: "IT Department Printer",
    },
    {
      model: "Xerox VersaLink C405",
      name: "Management Printer",
    },
    {
      model: "Epson EcoTank Pro ET-5850",
      name: "Customer Service Printer",
    },
    {
      model: "HP LaserJet Enterprise M507",
      name: "Accounting Printer",
    },
    {
      model: "Zebra ZT231",
      name: "Production Floor Printer",
    },
  ]);
};

export const MockClient: PrintersClient = {
  get,
};
