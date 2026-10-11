"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

const LiveRegionContext = createContext<(message: string) => void>(() => undefined);

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const announce = useMemo(() => (nextMessage: string) => setMessage(nextMessage), []);
  return (
    <LiveRegionContext.Provider value={announce}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
    </LiveRegionContext.Provider>
  );
}

export function useAnnounce() {
  return useContext(LiveRegionContext);
}
