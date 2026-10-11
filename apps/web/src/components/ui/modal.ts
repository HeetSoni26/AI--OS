"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const modalStack: symbol[] = [];
let bodyLockCount = 0;
let previousBodyOverflow = "";

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyLockCount += 1;
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) document.body.style.overflow = previousBodyOverflow;
}

function isTopModal(token: symbol) {
  return modalStack.at(-1) === token;
}

export function useModalPortalTarget(
  open: boolean,
  requestedTarget?: HTMLElement | null,
) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(open ? requestedTarget ?? document.body : null);
  }, [open, requestedTarget]);
  return target;
}

export function useModalBehavior({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  portalTarget,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  portalTarget?: HTMLElement | null;
}) {
  const tokenRef = useRef(Symbol("modal"));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const token = tokenRef.current;
    const restoreTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    modalStack.push(token);
    lockBodyScroll();

    const container = containerRef.current;
    const focusableItems = () => Array.from(
      container?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((item) => item.getAttribute("aria-hidden") !== "true");
    const focusInitial = () => {
      const requestedTarget = initialFocusRef?.current;
      if (requestedTarget && container?.contains(requestedTarget)) {
        requestedTarget.focus();
        return;
      }
      (focusableItems()[0] ?? container)?.focus();
    };

    focusInitial();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal(token)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableItems();
      if (items.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !container?.contains(activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (activeElement === last || !container?.contains(activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopModal(token) || container?.contains(event.target as Node)) return;
      focusInitial();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      const index = modalStack.lastIndexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      unlockBodyScroll();

      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [containerRef, initialFocusRef, open, portalTarget]);
}
