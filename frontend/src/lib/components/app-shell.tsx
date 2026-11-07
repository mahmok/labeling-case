import type { ChangeEvent, JSX } from "react";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { DRAWER_ID, Sidebar } from "./sidebar.tsx";
import { TopBar } from "./top-bar.tsx";

export const AppShell = (): JSX.Element => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="drawer min-h-screen bg-base-200 lg:drawer-open">
      <input
        checked={drawerOpen}
        className="drawer-toggle"
        id={DRAWER_ID}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDrawerOpen(event.currentTarget.checked)}
        type="checkbox"
      />
      <div className="drawer-content flex min-h-screen min-w-0 flex-col">
        <TopBar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <Sidebar onNavigate={() => setDrawerOpen(false)} />
    </div>
  );
};
