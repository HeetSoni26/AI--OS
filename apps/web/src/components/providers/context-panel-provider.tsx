"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type PanelRegistration = {
  id: string;
  order: number;
  render: () => ReactNode;
};

type PanelSnapshot = PanelRegistration & { version: number };
type Listener = () => void;

class ContextPanelRegistry {
  private listeners = new Set<Listener>();
  private registrations = new Map<string, PanelRegistration>();
  private nextOrder = 0;
  private version = 0;
  private snapshot: PanelSnapshot | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => null;

  register(id: string, render: () => ReactNode) {
    this.registrations.set(id, { id, order: this.nextOrder++, render });
    this.publish();
    return () => {
      this.registrations.delete(id);
      this.publish();
    };
  }

  update(id: string) {
    if (this.registrations.has(id)) this.publish();
  }

  private publish() {
    const registrations = Array.from(this.registrations.values());
    const active = registrations.reduce<PanelRegistration | null>(
      (latest, registration) =>
        !latest || registration.order > latest.order ? registration : latest,
      null,
    );
    this.snapshot = active ? { ...active, version: this.version++ } : null;
    this.listeners.forEach((listener) => listener());
  }
}

const ContextPanelContext = createContext<ContextPanelRegistry | null>(null);

export function ContextPanelProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<ContextPanelRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new ContextPanelRegistry();

  return (
    <ContextPanelContext.Provider value={registryRef.current}>
      {children}
    </ContextPanelContext.Provider>
  );
}

/** Registers content in the shell's contextual panel for this component's lifetime. */
export function useContextPanel(content: ReactNode) {
  const registry = useContext(ContextPanelContext);
  const id = useId();
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    if (!registry) {
      throw new Error("useContextPanel must be used within ContextPanelProvider");
    }
    return registry.register(id, () => contentRef.current);
  }, [id, registry]);

  useEffect(() => {
    registry?.update(id);
  });
}

export function ContextPanelOutlet({ fallback }: { fallback: ReactNode }) {
  const registry = useContext(ContextPanelContext);
  if (!registry) {
    throw new Error("ContextPanelOutlet must be used within ContextPanelProvider");
  }

  const registration = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getServerSnapshot,
  );

  return registration ? registration.render() : fallback;
}
