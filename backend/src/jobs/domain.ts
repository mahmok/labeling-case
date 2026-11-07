export type JobStatus = "pending" | "in_progress" | "completed" | "failed";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JobResult = Record<string, JsonValue>;

export type Job = {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
  attempts: number;
  result?: JobResult | null;
  error?: string | null;
};
