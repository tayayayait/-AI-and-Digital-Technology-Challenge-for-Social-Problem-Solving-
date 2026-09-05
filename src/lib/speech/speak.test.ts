import { afterEach, describe, expect, test, vi } from "vitest";

import { isSpeechSupported, speak, stopSpeaking } from "./speak";

const originalSpeechSynthesis = Object.getOwnPropertyDescriptor(window, "speechSynthesis");
const originalUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");

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

  vi.restoreAllMocks();
});

describe("speech support", () => {
  test("speechSynthesis가 있으면 지원 상태를 반환한다", () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak() {} },
    });

    expect(isSpeechSupported()).toBe(true);
  });

  test("speechSynthesis가 없으면 지원하지 않는 상태를 반환한다", () => {
    Reflect.deleteProperty(window, "speechSynthesis");

    expect(isSpeechSupported()).toBe(false);
  });
});

describe("speech playback", () => {
  test("한국어 문장을 0.95배속으로 읽기 전에 기존 발화를 취소한다", () => {
    const { cancel, speakMock } = installSpeechApi();

    expect(speak("  즉시 높은 곳으로 이동하세요.  ")).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(speakMock).toHaveBeenCalledOnce();

    const utterance = speakMock.mock.calls[0]?.[0] as {
      lang: string;
      rate: number;
      text: string;
    };
    expect(utterance.text).toBe("즉시 높은 곳으로 이동하세요.");
    expect(utterance.lang).toBe("ko-KR");
    expect(utterance.rate).toBe(0.95);
  });

  test("빈 문장은 재생하지 않는다", () => {
    const { cancel, speakMock } = installSpeechApi();

    expect(speak("   ")).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(speakMock).not.toHaveBeenCalled();
  });

  test("지원하지 않는 환경에서는 오류 없이 false를 반환한다", () => {
    Reflect.deleteProperty(window, "speechSynthesis");

    expect(speak("대피하세요.")).toBe(false);
  });

  test("발화 API 오류를 화면 오류로 전파하지 않는다", () => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(() => {
          throw new Error("speech unavailable");
        }),
        speak: vi.fn(),
      },
    });

    expect(speak("대피하세요.")).toBe(false);
    expect(() => stopSpeaking()).not.toThrow();
  });

  test("중지 요청은 진행 중인 발화를 취소한다", () => {
    const { cancel } = installSpeechApi();

    stopSpeaking();

    expect(cancel).toHaveBeenCalledOnce();
  });
});
