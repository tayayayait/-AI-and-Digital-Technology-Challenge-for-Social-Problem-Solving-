import { RefreshCw, X } from "lucide-react";

interface PwaUpdateBannerProps {
  visible: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

export function PwaUpdateBanner({ visible, onRefresh, onDismiss }: PwaUpdateBannerProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-3 z-[100] mx-auto flex max-w-[456px] items-center gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2.5 shadow-lg"
    >
      <RefreshCw aria-hidden="true" className="size-5 shrink-0 text-[var(--primary)]" />
      <span className="min-w-0 flex-1 text-sm font-bold text-[var(--text)]">
        새 버전이 있습니다
      </span>
      <button
        type="button"
        onClick={onRefresh}
        className="min-h-11 rounded-lg bg-[var(--primary)] px-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        새로고침
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="나중에"
        className="grid size-11 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
