import { describe, expect, test, vi } from "vitest";

import { captureVideoElementFrame, getCctvHlsErrorMessage } from "./captureFrame";

describe("captureVideoElementFrame", () => {
  test("1280px 너비 안에서 JPEG 프레임을 캡처한다", () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 },
    });
    const canvas = document.createElement("canvas");
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,YWJj");
    vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(canvas, "toDataURL").mockImplementation(toDataURL);

    expect(captureVideoElementFrame(video, canvas)).toBe("data:image/jpeg;base64,YWJj");
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.82);
  });

  test("재생 가능한 프레임이 없으면 분석용 이미지를 만들지 않는다", () => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");

    expect(() => captureVideoElementFrame(video, canvas)).toThrow(
      "CCTV 프레임을 불러오지 못했습니다.",
    );
  });

  test("HLS 401은 토큰 만료로 식별하고 비치명적 복구 오류는 무시한다", () => {
    expect(getCctvHlsErrorMessage({ fatal: true, response: { code: 401 } })).toBe(
      "CCTV HLS 토큰이 만료되었습니다. (401)",
    );
    expect(getCctvHlsErrorMessage({ fatal: false, response: { code: 500 } })).toBeNull();
    expect(getCctvHlsErrorMessage({ fatal: true, response: { code: 500 } })).toBe(
      "CCTV HLS 영상을 불러오지 못했습니다. (500)",
    );
  });
});
