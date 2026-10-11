import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function Empty({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#2A2E45] px-6 py-8 text-center", className)}>
      <span className="mb-3 flex size-10 items-center justify-center rounded-full border border-[#2A2E45] bg-[#111533] text-[#888]">
        {icon ?? <Inbox aria-hidden="true" className="size-4" />}
      </span>
      <h3 className="text-sm font-medium text-[#C5C8DB]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[#888]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
