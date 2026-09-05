import { useQuery } from "@tanstack/react-query";
import {
  buildRuleBasedAiAnswer,
  explainRouteWithGemini,
  type GeminiRouteExplanationInput,
} from "@/lib/api/gemini";

export const aiAdviceQueryKey = (input: GeminiRouteExplanationInput | null) =>
  ["ai-advice", input] as const;

export function useAiAdvice(input: GeminiRouteExplanationInput | null) {
  const query = useQuery({
    queryKey: aiAdviceQueryKey(input),
    queryFn: async () => {
      if (!input) return null;
      return explainRouteWithGemini(input);
    },
    enabled: Boolean(input),
    staleTime: 60 * 1000, // 1분 캐싱
  });

  return {
    ...query,
    // 네트워크 추론을 기다리는 동안에도 안전 규칙은 즉시 보여준다.
    data: query.data ?? (input ? buildRuleBasedAiAnswer(input) : null),
  };
}
