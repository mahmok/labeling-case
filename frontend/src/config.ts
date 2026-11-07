export interface Config {
  labelingBaseUrl: string;
  labelingWorkerBaseUrl: string;
}

export const config: Config = {
  labelingBaseUrl: import.meta.env.VITE_LABELING_BASE_URL ?? "http://localhost:3000",
  labelingWorkerBaseUrl: import.meta.env.VITE_LABELING_WORKER_BASE_URL ?? "http://localhost:3001",
};
