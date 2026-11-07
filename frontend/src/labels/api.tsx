import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_PREFIX, type DataResponse, responseError, toSearchParams } from "../lib/api-utils.ts";
import { asError, err, ok, type Result } from "../lib/result.ts";

export type Label = {
  id: string;
  name: string;
  version: string;
  nickname: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LabelSortKey = "id" | "name" | "nickname" | "version" | "isPrimary";
export type LabelListParams = {
  id?: string | string[];
  isPrimary?: boolean | boolean[];
  name?: string | string[];
  nickname?: string | string[];
  version?: string | string[];
  limit?: number;
  offset?: number;
  sort?: (`+${LabelSortKey}` | `-${LabelSortKey}`)[];
};
export type UpdateLabelInput = { isPrimary?: boolean; nickname?: string | null };

export const labelKeys = {
  all: ["labels"] as const,
  detail: (id: string) => [...labelKeys.details(), id] as const,
  details: () => [...labelKeys.all, "detail"] as const,
  list: (params: LabelListParams = {}) => [...labelKeys.lists(), params] as const,
  lists: () => [...labelKeys.all, "list"] as const,
};

export const listLabels = async (
  params: LabelListParams = {},
  signal?: AbortSignal,
): Promise<Result<Label[], Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/labels${toSearchParams(params)}`, { signal });
    if (!response.ok) return err<Label[], Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Label[]>;
    return ok(data);
  } catch (error) {
    return err<Label[], Error>(asError(error));
  }
};

export const getLabel = async (id: string, signal?: AbortSignal): Promise<Result<Label, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/labels/${encodeURIComponent(id)}`, { signal });
    if (!response.ok) return err<Label, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Label>;
    return ok(data);
  } catch (error) {
    return err<Label, Error>(asError(error));
  }
};

export const updateLabel = async ({
  id,
  ...input
}: { id: string } & UpdateLabelInput): Promise<Result<Label, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/labels/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) return err<Label, Error>(await responseError(response));
    const { data } = (await response.json()) as DataResponse<Label>;
    return ok(data);
  } catch (error) {
    return err<Label, Error>(asError(error));
  }
};

export const deleteLabel = async (id: string): Promise<Result<void, Error>> => {
  try {
    const response = await fetch(`${API_PREFIX}/labels/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return err<void, Error>(await responseError(response));
    return ok();
  } catch (error) {
    return err<void, Error>(asError(error));
  }
};

export const useLabels = (params: LabelListParams = {}): UseQueryResult<Result<Label[], Error>, Error> =>
  useQuery({
    queryFn: ({ signal }: { signal: AbortSignal }) => listLabels(params, signal),
    queryKey: labelKeys.list(params),
  });

export const useLabel = (id: string, enabled = true): UseQueryResult<Result<Label, Error>, Error> =>
  useQuery({
    enabled: enabled && id.length > 0,
    queryFn: ({ signal }: { signal: AbortSignal }) => getLabel(id, signal),
    queryKey: labelKeys.detail(id),
  });

export const useUpdateLabel = (): UseMutationResult<Result<Label, Error>, Error, { id: string } & UpdateLabelInput> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLabel,
    onSuccess: async (result: Result<Label, Error>): Promise<void> => {
      if (!result.isOk) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: labelKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: labelKeys.detail(result.value.id) }),
      ]);
    },
  });
};

export const useDeleteLabel = (): UseMutationResult<Result<void, Error>, Error, string> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteLabel,
    onSuccess: async (result: Result<void, Error>, id: string): Promise<void> => {
      if (!result.isOk) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: labelKeys.lists() }),
        queryClient.removeQueries({ queryKey: labelKeys.detail(id) }),
      ]);
    },
  });
};
