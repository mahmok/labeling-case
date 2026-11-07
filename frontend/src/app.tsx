import { QueryClientProvider } from "@tanstack/react-query";
import type { JSX } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { JobsPage } from "./jobs/pages";
import { LabelsPage } from "./labels/pages";
import { AppShell } from "./lib/components/app-shell.tsx";
import { queryClient } from "./lib/query-client.tsx";
import { PrintersPage } from "./printers/pages";
import { PrintsPage } from "./prints/pages";

export const App = (): JSX.Element => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<Navigate replace to="/prints" />} index />
          <Route element={<JobsPage />} path="jobs" />
          <Route element={<LabelsPage />} path="labels" />
          <Route element={<PrintersPage />} path="printers" />
          <Route element={<PrintsPage />} path="prints" />
          <Route element={<Navigate replace to="/jobs" />} path="*" />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
