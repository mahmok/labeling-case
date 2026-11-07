export type Print = {
  id: string;
  triggeredBy: string;
  printer: {
    id: string | null;
    name: string;
  };
  label: {
    id: string;
    name: string | null;
    version: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
};
