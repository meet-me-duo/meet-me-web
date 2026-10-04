import { useEffect, useState } from "react";
import { readRecentRooms, RECENT_ROOMS_EVENT, RECENT_ROOMS_KEY } from "../utils/recentRooms";

export function useRecentRooms() {
  const [recent, setRecent] = useState(readRecentRooms);
  useEffect(() => {
    const refresh = () => setRecent(readRecentRooms());
    const onStorage = (event: StorageEvent) => { if (event.key === RECENT_ROOMS_KEY || event.key === null) refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(RECENT_ROOMS_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RECENT_ROOMS_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return recent;
}
