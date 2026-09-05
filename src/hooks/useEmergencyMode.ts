import { useEffect, useState } from "react";

import type { RiskLevel } from "@/lib/types";

export const EMERGENCY_EXIT_DELAY_MS = 30_000;

export const useEmergencyMode = (level: RiskLevel) => {
  const isCritical = level === "CRITICAL";
  const [retainedCritical, setRetainedCritical] = useState(isCritical);

  useEffect(() => {
    if (isCritical) {
      setRetainedCritical(true);
      return;
    }
    if (!retainedCritical) return;

    const timeoutId = window.setTimeout(() => {
      setRetainedCritical(false);
    }, EMERGENCY_EXIT_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [isCritical, retainedCritical]);

  return isCritical || retainedCritical;
};
