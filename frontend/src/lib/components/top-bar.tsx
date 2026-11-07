import type { JSX } from "react";
import { ServiceHealthTooltip } from "./service-health-tooltip.tsx";
import { DRAWER_ID } from "./sidebar.tsx";

export const TopBar = (): JSX.Element => (
  <header className="navbar sticky top-0 z-10 min-h-16 border-b border-base-300 bg-base-100/95 px-4 backdrop-blur sm:px-8">
    <div className="navbar-start gap-2">
      <label
        aria-label="Open navigation menu"
        className="btn btn-ghost btn-square drawer-button lg:hidden"
        htmlFor={DRAWER_ID}
      >
        <svg
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </label>
      <span className="text-sm font-medium text-base-content/60">Labeling platform</span>
    </div>
    <div className="navbar-end">
      <ServiceHealthTooltip />
    </div>
  </header>
);
