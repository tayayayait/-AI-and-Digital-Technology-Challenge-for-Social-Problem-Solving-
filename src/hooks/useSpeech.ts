import { useCallback, useEffect, useRef, useState } from "react";

import { isSpeechSupported, speak, stopSpeaking } from "@/lib/speech/speak";
import type { RiskLevel } from "@/lib/types";

interface UseSpeechOptions {
  text: string;
  level: RiskLevel;
  autoEnabled: boolean;
}

const hasPreviousUserActivation = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const navigatorWithActivation = navigator as Navigator & {
    userActivation?: { hasBeenActive?: boolean };
  };
  return navigatorWithActivation.userActivation?.hasBeenActive === true;
};

export function useSpeech({ text, level, autoEnabled }: UseSpeechOptions) {
  const supported = isSpeechSupported();
  const [interactionReady, setInteractionReady] = useState(hasPreviousUserActivation);
  const autoSpokenRef = useRef(false);

  useEffect(() => {
    if (!supported || interactionReady || typeof document === "undefined") {
      return;
    }

    const markInteraction = () => setInteractionReady(true);
    document.addEventListener("click", markInteraction, { once: true });
    document.addEventListener("keydown", markInteraction, { once: true });

    return () => {
      document.removeEventListener("click", markInteraction);
      document.removeEventListener("keydown", markInteraction);
    };
  }, [interactionReady, supported]);

  useEffect(() => {
    if (level !== "CRITICAL") {
      autoSpokenRef.current = false;
      return;
    }

    if (!autoEnabled || !interactionReady || !supported || autoSpokenRef.current) {
      return;
    }

    autoSpokenRef.current = speak(text);
  }, [autoEnabled, interactionReady, level, supported, text]);

  useEffect(() => () => stopSpeaking(), []);

  const speakNow = useCallback(() => {
    const played = speak(text);
    if (played && level === "CRITICAL") {
      autoSpokenRef.current = true;
    }
    return played;
  }, [level, text]);

  return { supported, speakNow };
}
