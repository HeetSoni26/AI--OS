"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type ShellCommand = Readonly<{
  buttonLabel: string;
  buttonText: string;
  invoke: () => void;
}>;

type CommandRegistration = ShellCommand & {
  id: string;
  order: number;
};

type CommandSnapshot = CommandRegistration & { version: number };
type Listener = () => void;

class CommandRegistry {
  private listeners = new Set<Listener>();
  private registrations = new Map<string, CommandRegistration>();
  private nextOrder = 0;
  private version = 0;
  private snapshot: CommandSnapshot | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => null;

  register(id: string, command: ShellCommand) {
    this.registrations.set(id, { ...command, id, order: this.nextOrder++ });
    this.publish();
    return () => {
      this.registrations.delete(id);
      this.publish();
    };
  }

  update(id: string, command: ShellCommand) {
    const registration = this.registrations.get(id);
    if (!registration) return;
    this.registrations.set(id, { ...registration, ...command });
    this.publish();
  }

  private publish() {
    const active = Array.from(this.registrations.values()).reduce<CommandRegistration | null>(
      (latest, registration) =>
        !latest || registration.order > latest.order ? registration : latest,
      null,
    );
    this.snapshot = active ? { ...active, version: this.version++ } : null;
    this.listeners.forEach((listener) => listener());
  }
}

const CommandRegistrationContext = createContext<CommandRegistry | null>(null);

export function CommandRegistrationProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<CommandRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new CommandRegistry();

  return (
    <CommandRegistrationContext.Provider value={registryRef.current}>
      {children}
    </CommandRegistrationContext.Provider>
  );
}

/** Gives the most recently mounted route surface ownership of the shell command trigger. */
export function useShellCommandRegistration(command: ShellCommand) {
  const registry = useContext(CommandRegistrationContext);
  const id = useId();
  const commandRef = useRef(command);
  commandRef.current = command;

  const invoke = useCallback(() => commandRef.current.invoke(), []);

  useEffect(() => {
    if (!registry) {
      throw new Error("useShellCommandRegistration must be used within CommandRegistrationProvider");
    }
    return registry.register(id, { ...commandRef.current, invoke });
  }, [id, invoke, registry]);

  useEffect(() => {
    registry?.update(id, { ...commandRef.current, invoke });
  }, [command.buttonLabel, command.buttonText, id, invoke, registry]);
}

/** Resolves route registration when present and otherwise returns the shell fallback. */
export function useActiveShellCommand(fallback: ShellCommand) {
  const registry = useContext(CommandRegistrationContext);
  if (!registry) {
    throw new Error("useActiveShellCommand must be used within CommandRegistrationProvider");
  }

  const registration = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getServerSnapshot,
  );

  return registration ?? fallback;
}
