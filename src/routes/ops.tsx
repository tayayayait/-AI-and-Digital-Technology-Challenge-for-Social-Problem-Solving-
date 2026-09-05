import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/ops")({
  head: () => ({
    meta: [
      { title: "재난 대응 현황 — 침수퇴로 AI" },
      {
        name: "description",
        content: "위험지역, 주민 안내문, 대피소 및 공공데이터 상태를 확인합니다.",
      },
    ],
  }),
  beforeLoad: ({ location }) => {
    if (shouldRedirectOpsIndex(location.pathname)) {
      throw redirect({ to: "/ops/risk-zones" });
    }
  },
  component: OpsRouteShell,
});

export const shouldRedirectOpsIndex = (pathname: string) => pathname === "/ops";

function OpsRouteShell() {
  return <Outlet />;
}
