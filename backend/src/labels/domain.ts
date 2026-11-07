export type Label = {
  id: string;
  name: string;
  version: string;
  nickname: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
};
