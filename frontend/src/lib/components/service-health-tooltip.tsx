import type { UseQueryResult } from "@tanstack/react-query";
import type { JSX } from "react";
import { type ServiceHealth, useLabelingApiHealth, useLabelingWorkerHealth } from "../../health/api.tsx";
import type { Result } from "../result.ts";

type HealthQuery = UseQueryResult<Result<ServiceHealth, Error>, Error>;
type HealthStatus = { label: string; healthy: boolean | undefined; detail: string };

const statusFor = (query: HealthQuery): HealthStatus => {
  if (query.isPending) return { detail: "Checking connection", healthy: undefined, label: "Checking" };
  if (query.data?.isOk) return { detail: "Running", healthy: true, label: "Healthy" };
  const error = query.data && !query.data.isOk ? query.data.error : query.error;
  return { detail: error?.message ?? "No health response", healthy: false, label: "Unavailable" };
};

export const ServiceHealthTooltip = (): JSX.Element => {
  const apiHealth = statusFor(useLabelingApiHealth());
  const workerHealth = statusFor(useLabelingWorkerHealth());
  const allHealthy = apiHealth.healthy === true && workerHealth.healthy === true;
  const hasHealthIssue = apiHealth.healthy === false || workerHealth.healthy === false;
  const healthLabel = allHealthy ? "Online" : hasHealthIssue ? "Issue" : "Checking";
  const statusClass = allHealthy ? "status-success" : hasHealthIssue ? "status-error" : "status-warning";
  const tooltip = `API: ${apiHealth.label} (${apiHealth.detail})\nWorker: ${workerHealth.label} (${workerHealth.detail})`;

  return (
    <div className="tooltip tooltip-bottom tooltip-left before:max-w-72 before:whitespace-pre-line" data-tip={tooltip}>
      <button
        aria-label={`Service health. API: ${apiHealth.label}. Worker: ${workerHealth.label}.`}
        className="btn btn-ghost btn-sm gap-2 rounded-full border border-base-300 bg-base-100 px-3"
        type="button"
      >
        <span aria-hidden="true" className={`status status-sm ${statusClass}`} />
        <span className="hidden sm:inline">Services</span>
        <span className="badge badge-ghost badge-sm">{healthLabel}</span>
      </button>
    </div>
  );
};
