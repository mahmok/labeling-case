export type Printer = {
  id: string | null;
  name: string;
};

export type Label = {
  id: string;
  name: string | null;
  version: string | null;
};

export type Print = {
  id: string;
  triggeredBy: string;
  printer: Printer;
  label: Label;
  createdAt: Date;
  updatedAt: Date;
};
