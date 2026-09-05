import { useEffect, type ReactNode } from "react";
import { useScenario } from "@/store/scenario";

export function ScenarioHydrationGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  const hasHydrated = useScenario((state) => state.hasHydrated);

  useEffect(() => {
    let active = true;
    void Promise.resolve(useScenario.persist.rehydrate())
      .catch(() => undefined)
      .finally(() => {
        if (active) useScenario.getState().setHasHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return hasHydrated ? children : fallback;
}
