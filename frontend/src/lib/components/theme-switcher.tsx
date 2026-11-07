import { SunIcon } from "@heroicons/react/24/solid";
import type { JSX } from "react";

export const ThemeSwitcher = (): JSX.Element => (
  <details className="dropdown dropdown-end">
    <summary aria-label="Choose theme" className="btn btn-ghost btn-sm gap-2">
      <SunIcon aria-hidden="true" className="size-5" />
      <span className="hidden sm:inline">Theme</span>
    </summary>
    <ul className="menu dropdown-content z-20 mt-2 w-40 rounded-box border border-base-300 bg-base-100 p-2 shadow">
      <li>
        <label className="cursor-pointer justify-between">
          Light
          <input
            aria-label="Light theme"
            className="radio radio-sm theme-controller"
            defaultChecked
            name="labeling-theme"
            type="radio"
            value="light"
          />
        </label>
      </li>
      <li>
        <label className="cursor-pointer justify-between">
          Night
          <input
            aria-label="Night theme"
            className="radio radio-sm theme-controller"
            name="labeling-theme"
            type="radio"
            value="night"
          />
        </label>
      </li>
    </ul>
  </details>
);
