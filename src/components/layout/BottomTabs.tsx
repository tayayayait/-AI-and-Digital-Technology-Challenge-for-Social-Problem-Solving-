import { Link, useLocation } from "@tanstack/react-router";
import { Home, Building2, CloudRain, HelpCircle } from "lucide-react";

const TABS = [
  { to: "/", label: "홈", icon: Home },
  { to: "/shelters", label: "대피소", icon: Building2 },
  { to: "/forecast", label: "전망", icon: CloudRain },
  { to: "/help", label: "도움", icon: HelpCircle },
] as const;

export function BottomTabs() {
  const { pathname } = useLocation();
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-[var(--border-soft)] pb-[env(safe-area-inset-bottom)]"
      style={{
        boxSizing: "border-box",
        height: "calc(64px + env(safe-area-inset-bottom))",
        zIndex: 50,
      }}
      aria-label="주요 메뉴"
    >
      <ul className="flex h-full">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className="flex flex-col items-center justify-center h-full gap-1"
                style={{
                  color: active ? "var(--primary)" : "var(--text-subtle)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
                <span style={{ fontSize: 11, lineHeight: "14px" }}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
