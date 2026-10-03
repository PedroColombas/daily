import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useT } from "../i18n/LanguageProvider";
import type { Strings } from "../i18n/strings";

type Tab = { to: string; label: keyof Strings["nav"]; end: boolean; icon: (active: boolean) => ReactNode };

const TABS: Tab[] = [
  {
    to: "/",
    label: "today",
    end: true,
    icon: () => (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3.2" />
        <line x1="8" y1="9" x2="16" y2="9" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="12.5" y2="17" />
      </>
    ),
  },
  {
    to: "/preferences",
    label: "prefs",
    end: false,
    icon: (active) => (
      <>
        <line x1="4" y1="8.5" x2="20" y2="8.5" />
        <circle cx="15" cy="8.5" r="2.5" fill={active ? "currentColor" : "none"} />
        <line x1="4" y1="15.5" x2="20" y2="15.5" />
        <circle cx="9" cy="15.5" r="2.5" fill={active ? "currentColor" : "none"} />
      </>
    ),
  },
  {
    to: "/history",
    label: "history",
    end: false,
    icon: () => (
      <>
        <circle cx="12" cy="12" r="8.4" />
        <path d="M12 7.6 V12 L15 14" />
      </>
    ),
  },
  {
    to: "/profile",
    label: "profile",
    end: false,
    icon: () => (
      <>
        <circle cx="12" cy="9" r="3.4" />
        <path d="M5.5 19.5 a6.6 6.6 0 0 1 13 0" />
      </>
    ),
  },
];

export function BottomNav() {
  const t = useT();
  return (
    <nav className="sticky bottom-0 grid grid-cols-4 border-t border-[var(--line)] bg-[var(--paper)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          data-tour={tab.to === "/preferences" ? "prefs" : tab.to === "/history" ? "history" : undefined}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 pt-2.5 pb-2 ${
              isActive ? "text-[var(--accent)]" : "text-[var(--faint)]"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tab.icon(isActive)}
              </svg>
              <span className={`text-[10.5px] ${isActive ? "font-semibold" : "font-medium"}`}>
                {t.nav[tab.label]}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
