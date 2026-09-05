const HLS_MIME_TYPE = "application/vnd.apple.mpegurl";
const FRAME_LOAD_TIMEOUT_MS = 12_000;
const MAX_FRAME_WIDTH = 1_280;

interface CctvHlsErrorData {
  fatal: boolean;
  response?: { code?: number };
}

export const getCctvHlsErrorMessage = ({ fatal, response }: CctvHlsErrorData) => {
  const statusCode = response?.code;
  if (statusCode === 401) return "CCTV HLS 토큰이 만료되었습니다. (401)";
  if (!fatal) return null;
  return `CCTV HLS 영상을 불러오지 못했습니다.${statusCode ? ` (${statusCode})` : ""}`;
};

const waitForVideoFrame = (video: HTMLVideoElement, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve();
      return;
    }

    const cleanup = () => {
      clearTimeout(timeoutId);
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("CCTV 영상을 재생하지 못했습니다."));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("CCTV 프레임 로딩 시간이 초과되었습니다."));
    }, timeoutMs);

    video.addEventListener("loadeddata", handleLoaded, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });

export const captureVideoElementFrame = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
) => {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error("CCTV 프레임을 불러오지 못했습니다.");
  }

  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("CCTV 프레임 캡처를 지원하지 않는 브라우저입니다.");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    throw new Error("CCTV 제공처가 프레임 캡처를 허용하지 않습니다.");
  }
};

export const captureCctvFrame = async (
  streamUrl: string,
  timeoutMs = FRAME_LOAD_TIMEOUT_MS,
): Promise<string> => {
  if (!streamUrl.startsWith("https://")) {
    throw new Error("HTTPS CCTV 영상만 AI 판독에 사용할 수 있습니다.");
  }

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.cssText =
    "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px";
  document.body.append(video);

  let destroyHls: (() => void) | undefined;
  try {
    const frameReady = waitForVideoFrame(video, timeoutMs);
    if (video.canPlayType(HLS_MIME_TYPE)) {
      video.src = streamUrl;
      await frameReady;
    } else {
      const { default: Hls } = await import("hls.js");
      if (!Hls.isSupported()) throw new Error("이 브라우저는 HLS CCTV 재생을 지원하지 않습니다.");
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      destroyHls = () => hls.destroy();
      const hlsFailure = new Promise<never>((_, reject) => {
        hls.on(Hls.Events.ERROR, (_event, data) => {
          const message = getCctvHlsErrorMessage(data);
          if (message) reject(new Error(message));
        });
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      await Promise.race([frameReady, hlsFailure]);
    }

    await video.play().catch(() => undefined);
    return captureVideoElementFrame(video);
  } finally {
    destroyHls?.();
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
};
