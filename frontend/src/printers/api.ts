import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_PREFIX, type DataResponse, responseError, toSearchParams } from "../lib/api-utils.ts";
import { asError, err, ok, type Result } from "../lib/result.ts";

export type Printer = {
  id: string;
  name: string;
  model: string;
  nickname: string | null;
  location: string;
  serialNumber: string;
  createdAt: string;
  updatedAt: string;
};

export type PrinterSortKey =
  | "id"
  | "name"
  | "nickname"
  | "model"
  | "location"
  | "serialNumber"
  | "createdAt"
  | "updatedAt";
export type PrinterListParams = {
  id?: string | string[];
  location?: string | string[];
  model?: string | string[];
  name?: string | string[];
  nickname?: string | string[];
  serialNumber?: string | string[];
  limit?: number;
  offset?: number;
  sort?: (`+${PrinterSortKey}` | `-${PrinterSortKey}`)[];
};
export type UpdatePrinterInput = {
  location?: string;
  nickname?: string | null;
  serialNumber?: string;
};

export const printerKeys = {
  all: ["printers"] as const,
  detail: (id: string) => [...printerKeys.details(), id] as const,
  details: () => [...printerKeys.all, "detail"] as const,
  list: (params: PrinterListParams = {}) => [...printerKeys.lists(), params] as const,
  lists: () => [...printerKeys.all, "list"] as const,
};

export const listPrinters = async (
  params: PrinterListParams = {},
  signal?: AbortSignal,
): Promise<Result<Printer[], Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/printers${toSearchParams(params)}`, { signal });
    if (!response.ok) return err<Printer[], Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Printer[]>;
    return ok(data);
  } catch (error) {
    return err<Printer[], Error>(asError(error));
  }
};

export const getPrinter = async (id: string, signal?: AbortSignal): Promise<Result<Printer, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/printers/${encodeURIComponent(id)}`, { signal });
    if (!response.ok) return err<Printer, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Printer>;
    return ok(data);
  } catch (error) {
    return err<Printer, Error>(asError(error));
  }
};

export const updatePrinter = async ({
  id,
  ...input
}: { id: string } & UpdatePrinterInput): Promise<Result<Printer, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/printers/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) return err<Printer, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Printer>;
    return ok(data);
  } catch (error) {
    return err<Printer, Error>(asError(error));
  }
};

export const deletePrinter = async (id: string): Promise<Result<void, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/printers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return err<void, Error>(await responseError(response));
    return ok();
  } catch (error) {
    return err<void, Error>(asError(error));
  }
};

export const usePrinters = (params: PrinterListParams = {}): UseQueryResult<Result<Printer[], Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => listPrinters(params, signal),
    queryKey: printerKeys.list(params),
  });

export const usePrinter = (id: string, enabled = true): UseQueryResult<Result<Printer, Error>, Error> =>
  useQuery({
    enabled: enabled && id.length > 0,
    queryFn: ({ signal }: { signal: AbortSignal }) => getPrinter(id, signal),
    queryKey: printerKeys.detail(id),
  });

export const useUpdatePrinter = (): UseMutationResult<
  Result<Printer, Error>,
  Error,
  { id: string } & UpdatePrinterInput
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePrinter,
    onSuccess: async (result: Result<Printer, Error>): Promise<void> => {
      if (!result.isOk) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: printerKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: printerKeys.detail(result.value.id) }),
      ]);
    },
  });
};

export const useDeletePrinter = (): UseMutationResult<Result<void, Error>, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePrinter,
    onSuccess: async (result: Result<void, Error>, id: string): Promise<void> => {
      if (!result.isOk) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: printerKeys.lists() }),
        queryClient.removeQueries({ queryKey: printerKeys.detail(id) }),
      ]);
    },
  });
};
