"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModalBehavior, useModalPortalTarget } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export function Dialog({
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const resolvedPortalTarget = useModalPortalTarget(open, portalTarget);
  useModalBehavior({
    open: open && Boolean(resolvedPortalTarget),
    onClose,
    containerRef: dialogRef,
    initialFocusRef,
    portalTarget: resolvedPortalTarget,
  });

  if (!open || !resolvedPortalTarget) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="presentation">
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-[#07080F]/80 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn("dialog-enter surface-scrollbar relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#2A2E45] bg-[#0C1020] p-6 outline-none", className)}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-[#F3F5FF]">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-xs leading-5 text-[#888]">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    resolvedPortalTarget,
  );
}
