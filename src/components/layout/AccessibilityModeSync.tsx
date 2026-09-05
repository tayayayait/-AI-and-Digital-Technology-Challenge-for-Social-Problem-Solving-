import { useEffect } from "react";

import { useAccessibility } from "@/store/accessibility";

export function AccessibilityModeSync() {
  const mobilityMode = useAccessibility((state) => state.mobilityMode);

  useEffect(() => {
    const root = document.documentElement;
    if (mobilityMode) {
      root.dataset.a11y = "large-contrast";
    } else {
      root.removeAttribute("data-a11y");
    }

    return () => root.removeAttribute("data-a11y");
  }, [mobilityMode]);

  return null;
}
