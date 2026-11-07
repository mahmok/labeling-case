import { ArrowPathIcon, NewspaperIcon, PrinterIcon, TagIcon } from "@heroicons/react/24/solid";
import type { JSX } from "react";
import { NavLink } from "react-router-dom";

export const DRAWER_ID = "labeling-drawer";

type NavigationItemProps = {
  icon: typeof NewspaperIcon;
  label: string;
  to: string;
};

const navigationItems: NavigationItemProps[] = [
  { icon: NewspaperIcon, label: "Prints", to: "/prints" },
  { icon: TagIcon, label: "Labels", to: "/labels" },
  { icon: PrinterIcon, label: "Printers", to: "/printers" },
  { icon: ArrowPathIcon, label: "Jobs", to: "/jobs" },
];

const NavigationItem = ({
  icon: Icon,
  label,
  onNavigate,
  to,
}: NavigationItemProps & { onNavigate: () => void }): JSX.Element => (
  <li>
    <NavLink
      className={({ isActive }: { isActive: boolean }): string => (isActive ? "menu-active" : "")}
      end
      onClick={onNavigate}
      to={to}
    >
      <Icon aria-hidden="true" className="size-6" />
      {label}
    </NavLink>
  </li>
);

export const Sidebar = ({ onNavigate }: { onNavigate: () => void }): JSX.Element => (
  <div className="drawer-side z-20">
    <label aria-label="Close navigation" className="drawer-overlay" htmlFor={DRAWER_ID} />
    <aside className="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100">
      <NavLink className="flex items-center gap-3 px-5 py-5" onClick={onNavigate} to="/prints">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-content shadow-sm">
          L
        </span>
        <span>
          <span className="block text-sm font-bold tracking-wide">LABELING</span>
          <span className="block text-xs text-base-content/60">Operations platform</span>
        </span>
      </NavLink>

      <ul className="menu menu-md w-full grow gap-1 px-3 py-1">
        <li className="menu-title px-3 uppercase tracking-[0.16em]">Workspace</li>
        {navigationItems.map((item) => (
          <NavigationItem key={item.to} onNavigate={onNavigate} {...item} />
        ))}
      </ul>

      <div className="border-t border-base-300 px-5 py-4 text-xs text-base-content/50">Labeling Platform</div>
    </aside>
  </div>
);
