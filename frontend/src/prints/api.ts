import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_PREFIX, type DataResponse, responseError, toSearchParams } from "../lib/api-utils.ts";
import { asError, err, ok, type Result } from "../lib/result.ts";

export type Print = {
  id: string;
  label: { id: string; name: string | null; version: string | null };
  printer: { id: string | null; name: string };
  triggeredBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PrintSortKey =
  | "id"
  | "printerId"
  | "printerName"
  | "triggeredBy"
  | "labelId"
  | "labelName"
  | "labelVersion"
  | "createdAt"
  | "updatedAt";
export type PrintListParams = {
  id?: string | string[];
  labelId?: string | string[];
  labelName?: string | string[];
  labelVersion?: string | string[];
  printerId?: string | string[];
  printerIdIsNull?: boolean;
  printerName?: string | string[];
  triggeredBy?: string | string[];
  limit?: number;
  offset?: number;
  sort?: (`+${PrintSortKey}` | `-${PrintSortKey}`)[];
};
export type CreatePrintInput = { labelId: string; printerName: string };

export const printKeys = {
  all: ["prints"] as const,
  detail: (id: string) => [...printKeys.details(), id] as const,
  details: () => [...printKeys.all, "detail"] as const,
  list: (params: PrintListParams = {}) => [...printKeys.lists(), params] as const,
  lists: () => [...printKeys.all, "list"] as const,
};

export const listPrints = async (
  params: PrintListParams = {},
  signal?: AbortSignal,
): Promise<Result<Print[], Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/prints${toSearchParams(params)}`, { signal });
    if (!response.ok) return err<Print[], Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Print[]>;
    return ok(data);
  } catch (error) {
    return err<Print[], Error>(asError(error));
  }
};

export const getPrint = async (id: string, signal?: AbortSignal): Promise<Result<Print, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/prints/${encodeURIComponent(id)}`, { signal });
    if (!response.ok) return err<Print, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Print>;
    return ok(data);
  } catch (error) {
    return err<Print, Error>(asError(error));
  }
};

export const createPrint = async (input: CreatePrintInput): Promise<Result<Print, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/prints`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return err<Print, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Print>;
    return ok(data);
  } catch (error) {
    return err<Print, Error>(asError(error));
  }
};

export const usePrints = (params: PrintListParams = {}): UseQueryResult<Result<Print[], Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => listPrints(params, signal),
    queryKey: printKeys.list(params),
  });

export const usePrint = (id: string, enabled = true): UseQueryResult<Result<Print, Error>, Error> =>
  useQuery({
    enabled: enabled && id.length > 0,
    queryFn: ({ signal }: { signal: AbortSignal }) => getPrint(id, signal),
    queryKey: printKeys.detail(id),
  });

export const useCreatePrint = (): UseMutationResult<Result<Print, Error>, Error, CreatePrintInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPrint,
    onSuccess: async (result: Result<Print, Error>): Promise<void> => {
      if (!result.isOk) return;
      queryClient.setQueryData(printKeys.detail(result.value.id), ok(result.value));
      await queryClient.invalidateQueries({ queryKey: printKeys.lists() });
    },
  });
};
