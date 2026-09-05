import { useState, type FormEvent } from "react";

import { geocodeAddress, validateAddressQuery, type GeocodeResult } from "@/lib/geocoding";

interface AddressFallbackProps {
  onSelect: (result: GeocodeResult) => void;
  geocode?: (query: string) => Promise<GeocodeResult[]>;
}

export function AddressFallback({ onSelect, geocode = geocodeAddress }: AddressFallbackProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateAddressQuery(query);
    if (!validation.ok) {
      setError(validation.error);
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextResults = await geocode(validation.value);
      setResults(nextResults);
      if (nextResults.length === 0) {
        setError("검색 결과가 없습니다. 다른 주소를 입력하세요.");
      }
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : "주소를 검색하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-[var(--border-soft)] rounded-[12px] p-4 shadow-sm">
      <h2 className="text-[16px] font-extrabold">주소로 위치 설정</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
        현재 위치를 사용할 수 없습니다. 주소를 입력하면 해당 위치 기준으로 대피 경로를 계산합니다.
      </p>

      <form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
        <div className="min-w-0 flex-1">
          <label htmlFor="address-fallback-query" className="sr-only">
            주소 또는 장소명
          </label>
          <input
            id="address-fallback-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={80}
            placeholder="예: 시청, 중앙대로 100"
            className="h-[44px] w-full rounded-[10px] border border-[var(--border)] px-3 text-[14px] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(37,99,235,0.18)]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="h-[44px] shrink-0 rounded-[10px] bg-[var(--primary)] px-4 text-[14px] font-extrabold text-white disabled:bg-[var(--border)]"
        >
          {loading ? "검색 중" : "주소 검색"}
        </button>
      </form>

      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setResults([]);
            setError(null);
          }}
          className="mt-2 min-h-[32px] text-[12px] font-bold text-[var(--text-subtle)]"
        >
          입력 지우기
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[12px] font-bold text-[var(--risk-critical-text)]">
          {error}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => onSelect(result)}
                className="min-h-[44px] w-full rounded-[10px] border border-[var(--border-soft)] bg-[var(--surface-alt)] px-3 py-2 text-left"
              >
                <span className="block text-[14px] font-bold">{result.label}</span>
                <span className="mt-0.5 block text-[12px] text-[var(--text-subtle)]">
                  {result.address}
                  {result.source === "FALLBACK" ? " · 시연 좌표" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
