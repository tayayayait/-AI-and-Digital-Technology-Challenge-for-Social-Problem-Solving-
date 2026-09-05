import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { RiskLevel } from "@/lib/types";
import { useSpeech } from "./useSpeech";

const originalSpeechSynthesis = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
const originalUserActivation = Object.getOwnPropertyDescriptor(navigator, "userActivation");

const installSpeechApi = () => {
  const cancel = vi.fn();
  const speakMock = vi.fn();

  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel, speak: speakMock },
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    configurable: true,
    value: class FakeSpeechSynthesisUtterance {
      lang = "";
      rate = 1;

      constructor(public readonly text: string) {}
    },
  });

  return { cancel, speakMock };
};

const setUserActivation = (hasBeenActive: boolean) => {
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { hasBeenActive, isActive: hasBeenActive },
  });
};

beforeEach(() => {
  setUserActivation(false);
});

afterEach(() => {
  if (originalSpeechSynthesis) {
    Object.defineProperty(window, "speechSynthesis", originalSpeechSynthesis);
  } else {
    Reflect.deleteProperty(window, "speechSynthesis");
  }
  if (originalUtterance) {
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", originalUtterance);
  } else {
    Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance");
  }
  if (originalUserActivation) {
    Object.defineProperty(navigator, "userActivation", originalUserActivation);
  } else {
    Reflect.deleteProperty(navigator, "userActivation");
  }
  vi.restoreAllMocks();
});

describe("useSpeech", () => {
  test("미지원 브라우저에서는 재생 기능을 노출하지 않고 오류도 내지 않는다", () => {
    Reflect.deleteProperty(window, "speechSynthesis");
    const { result } = renderHook(() =>
      useSpeech({ text: "대피하세요.", level: "WARNING", autoEnabled: false }),
    );

    expect(result.current.supported).toBe(false);
    expect(result.current.speakNow()).toBe(false);
  });

  test("자동 설정과 무관하게 모든 단계에서 수동 재생할 수 있다", () => {
    const { speakMock } = installSpeechApi();
    const { result } = renderHook(() =>
      useSpeech({ text: "안전 행동을 확인하세요.", level: "WATCH", autoEnabled: false }),
    );

    let played = false;
    act(() => {
      played = result.current.speakNow();
    });

    expect(played).toBe(true);
    expect(speakMock).toHaveBeenCalledOnce();
    expect((speakMock.mock.calls[0]?.[0] as { text: string }).text).toBe("안전 행동을 확인하세요.");
  });

  test("동의 후 사용자 상호작용이 생기면 CRITICAL 진입마다 한 번만 자동 재생한다", async () => {
    const { speakMock } = installSpeechApi();
    const { rerender } = renderHook(
      ({ level }: { level: RiskLevel }) =>
        useSpeech({ text: "즉시 대피하세요.", level, autoEnabled: true }),
      { initialProps: { level: "CRITICAL" as RiskLevel } },
    );

    expect(speakMock).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(speakMock).toHaveBeenCalledOnce());

    rerender({ level: "CRITICAL" });
    expect(speakMock).toHaveBeenCalledOnce();

    rerender({ level: "WARNING" });
    await waitFor(() => expect(speakMock).toHaveBeenCalledOnce());

    rerender({ level: "CRITICAL" });
    await waitFor(() => expect(speakMock).toHaveBeenCalledTimes(2));
  });

  test("자동 설정이 꺼져 있으면 상호작용 후에도 자동 재생하지 않는다", () => {
    const { speakMock } = installSpeechApi();
    renderHook(() =>
      useSpeech({ text: "즉시 대피하세요.", level: "CRITICAL", autoEnabled: false }),
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(speakMock).not.toHaveBeenCalled();
  });

  test("CRITICAL에서 수동으로 들은 직후 자동 안내를 중복 재생하지 않는다", () => {
    const { speakMock } = installSpeechApi();
    const { result } = renderHook(() =>
      useSpeech({ text: "즉시 대피하세요.", level: "CRITICAL", autoEnabled: true }),
    );

    act(() => {
      result.current.speakNow();
      document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(speakMock).toHaveBeenCalledOnce();
  });

  test("화면에서 이탈하면 진행 중인 발화를 중지한다", () => {
    const { cancel } = installSpeechApi();
    const { unmount } = renderHook(() =>
      useSpeech({ text: "대피하세요.", level: "WARNING", autoEnabled: false }),
    );

    unmount();

    expect(cancel).toHaveBeenCalledOnce();
  });
});
