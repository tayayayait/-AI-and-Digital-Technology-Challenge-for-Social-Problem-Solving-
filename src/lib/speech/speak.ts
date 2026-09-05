export const isSpeechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export interface SpeakOptions {
  lang?: string;
  rate?: number;
}

export const speak = (text: string, options: SpeakOptions = {}) => {
  const sentence = text.trim();

  if (!sentence || !isSpeechSupported()) {
    return false;
  }

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = options.lang ?? "ko-KR";
    utterance.rate = options.rate ?? 0.95;
    window.speechSynthesis.speak(utterance);

    return true;
  } catch {
    return false;
  }
};

export const stopSpeaking = () => {
  if (!isSpeechSupported()) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
  } catch {
    // 음성 API 실패는 화면 흐름을 막지 않는다.
  }
};
