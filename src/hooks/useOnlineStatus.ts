import { useEffect, useState } from "react";
import { queryNetworkSignal } from "@/lib/offline/networkSignal";

export const useOnlineStatus = () => {
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queryReachable, setQueryReachable] = useState(() => queryNetworkSignal.isReachable());

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      queryNetworkSignal.reset();
    };
    const handleOffline = () => setBrowserOnline(false);
    const unsubscribe = queryNetworkSignal.subscribe(setQueryReachable);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, []);

  return browserOnline && queryReachable;
};
