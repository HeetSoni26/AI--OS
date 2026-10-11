import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  neutral: "border-[#2A2E45] bg-white/[0.03] text-[#C5C8DB]",
  cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  green: "border-green-400/30 bg-green-400/10 text-green-300",
  purple: "border-purple-400/30 bg-purple-400/10 text-purple-200",
  orange: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  pink: "border-pink-400/30 bg-pink-400/10 text-pink-200",
} as const;

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide", variants[variant], className)}
      {...props}
    />
  );
}
