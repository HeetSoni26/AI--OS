"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModalBehavior, useModalPortalTarget } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  className,
  initialFocusRef,
  portalTarget,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  portalTarget?: HTMLElement | null;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const resolvedPortalTarget = useModalPortalTarget(open, portalTarget);
  useModalBehavior({
    open: open && Boolean(resolvedPortalTarget),
    onClose,
    containerRef: drawerRef,
    initialFocusRef,
    portalTarget: resolvedPortalTarget,
  });

  if (!open || !resolvedPortalTarget) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110]" role="presentation">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-[#07080F]/65" onClick={onClose} />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn("drawer-enter surface-scrollbar absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-[#2A2E45] bg-[#0C1020] outline-none", className)}
      >
        <header className="flex min-h-16 items-start justify-between gap-4 border-b border-[#2A2E45] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-[#F3F5FF]">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-xs text-[#888]">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close drawer" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </Button>
        </header>
        <div className="surface-scrollbar min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>,
    resolvedPortalTarget,
  );
}
