import { useRegisterSW } from "virtual:pwa-register/react";
import { PwaUpdateBanner } from "./PwaUpdateBanner";

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn("서비스워커를 등록하지 못했습니다. 일반 웹앱으로 계속합니다.", error);
    },
  });

  return (
    <PwaUpdateBanner
      visible={needRefresh}
      onRefresh={() => void updateServiceWorker(true)}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
