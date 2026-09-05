import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useScenario } from "@/store/scenario";
import { ScenarioHydrationGate } from "./ScenarioHydrationGate";

describe("ScenarioHydrationGate", () => {
  beforeEach(() => {
    localStorage.clear();
    useScenario.setState({ hasHydrated: false });
  });

  it("mounts data consumers only after the persisted scenario is restored", async () => {
    localStorage.setItem(
      "chimsu-scenario",
      JSON.stringify({
        version: 1,
        state: {
          origin: { lat: 37.498, lng: 127.028 },
          locationStatus: "GRANTED",
          riskLevel: "WARNING",
          riskScore: 62,
          lastConfirmedAt: "2026-08-31T08:02:00.000Z",
          lastRecommendation: null,
        },
      }),
    );
    const firstObservedLevels: string[] = [];

    function ScenarioConsumer() {
      const level = useScenario((state) => state.riskLevel);
      if (firstObservedLevels.length === 0) firstObservedLevels.push(level);
      return <span>복원 위험도 {level}</span>;
    }

    render(
      <ScenarioHydrationGate fallback={<span>저장 상태 복원 중</span>}>
        <ScenarioConsumer />
      </ScenarioHydrationGate>,
    );

    await waitFor(() => expect(screen.getByText("복원 위험도 WARNING")).toBeInTheDocument());
    expect(firstObservedLevels).toEqual(["WARNING"]);
  });
});
