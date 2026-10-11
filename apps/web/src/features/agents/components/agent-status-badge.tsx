"use client";

import { AGENT_STATUS_LABELS, type AgentStatus } from "@aios/contracts";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<AgentStatus, { dot: string; text: string; pulse?: boolean }> = {
  running: { dot: "bg-[#39FF14]", text: "text-[#39FF14]", pulse: true },
  idle: { dot: "bg-amber-300", text: "text-amber-200" },
  error: { dot: "bg-[#FF4D6D]", text: "text-[#FF4D6D]" },
  paused: { dot: "bg-[#888]", text: "text-[#888]" },
  scheduled: { dot: "bg-[#B026FF]", text: "text-purple-300" },
};

export function AgentStatusBadge({
  status,
  className,
  showLabel = true,
}: {
  status: AgentStatus;
  className?: string;
  showLabel?: boolean;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[#2A2E45] bg-[#0C1020] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      <span className="relative flex size-1.5" aria-hidden="true">
        {style.pulse ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", style.dot)} /> : null}
        <span className={cn("relative inline-flex size-1.5 rounded-full", style.dot)} />
      </span>
      {showLabel ? <span className={style.text}>{AGENT_STATUS_LABELS[status] ?? status}</span> : <span className="sr-only">{status}</span>}
    </span>
  );
}
