import { Link, useLocation } from "@tanstack/react-router";
import { Activity, Building2, MessageSquareText, TriangleAlert } from "lucide-react";

const OPS_NAV = [
  { to: "/ops/risk-zones", label: "위험지역", icon: TriangleAlert },
  { to: "/ops/messages", label: "주민 안내문", icon: MessageSquareText },
  { to: "/ops/shelters", label: "대피소", icon: Building2 },
  { to: "/ops/data-health", label: "데이터 상태", icon: Activity },
] as const;

export function OpsSidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="ops-sidebar bg-white border-r border-[var(--border-soft)]">
      <div className="px-4 py-4 border-b border-[var(--border-soft)]">
        <div className="text-[12px] font-bold text-[var(--text-subtle)]">재난 대응 정보</div>
        <div className="mt-1 text-[18px] font-extrabold">운영 현황</div>
      </div>
      <nav className="ops-nav p-3" aria-label="현장정보 메뉴">
        {OPS_NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="ops-nav-item flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-bold"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "var(--text-muted)",
              }}
            >
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
