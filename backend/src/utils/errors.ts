export type NotFoundError = Error & {
  code: "NOT_FOUND";
  id: string;
  resource: string;
};

export const notFoundError = (resource: string, id: string): NotFoundError =>
  Object.assign(new Error(`${resource} ${id} was not found`), {
    code: "NOT_FOUND" as const,
    id,
    resource,
  });

export const isNotFoundError = (error: Error): error is NotFoundError =>
  "code" in error && error.code === "NOT_FOUND" && "id" in error && "resource" in error;
