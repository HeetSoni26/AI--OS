"use client";

import {
  createContext,
  useContext,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  baseId: string;
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used within Tabs");
  return context;
}

function valueId(value: string) {
  return encodeURIComponent(value).replaceAll("%", "-");
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlledValue ?? uncontrolledValue;
  const setValue = (nextValue: string) => {
    if (controlledValue === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <TabsContext.Provider value={{ baseId, value, setValue }}>
      <div className={cn("min-w-0", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn("surface-scrollbar flex gap-1 overflow-x-auto border-b border-[#2A2E45]", className)}
      {...props}
    />
  );
}

export function Tab({ value, className, onKeyDown, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const context = useTabsContext();
  const selected = context.value === value;
  const idValue = valueId(value);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? [],
    );
    const index = tabs.indexOf(event.currentTarget);
    if (index < 0 || tabs.length === 0) return;

    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <button
      type="button"
      role="tab"
      id={`${context.baseId}-tab-${idValue}`}
      aria-controls={`${context.baseId}-panel-${idValue}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={cn(
        "relative min-h-10 shrink-0 px-3 text-xs font-medium text-[#888] transition-colors hover:text-[#F3F5FF] aria-selected:text-cyan-200 aria-selected:after:absolute aria-selected:after:inset-x-2 aria-selected:after:bottom-0 aria-selected:after:h-px aria-selected:after:bg-cyan-300",
        className,
      )}
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setValue(value);
      }}
      {...props}
    />
  );
}

export function TabPanel({ value, className, ...props }: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useTabsContext();
  const selected = context.value === value;
  const idValue = valueId(value);

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${idValue}`}
      aria-labelledby={`${context.baseId}-tab-${idValue}`}
      tabIndex={0}
      hidden={!selected}
      className={cn("py-4 focus:outline-none", className)}
      {...props}
    />
  );
}
