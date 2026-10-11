"use client";

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PageItem = number | "ellipsis-start" | "ellipsis-end";

function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", pageCount];
  if (page >= pageCount - 3) return [1, "ellipsis-start", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", pageCount];
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize,
  label = "Pagination",
  className,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  label?: string;
  className?: string;
}) {
  const safePageCount = Math.max(1, pageCount);
  const safePage = Math.min(Math.max(1, page), safePageCount);
  const items = pageItems(safePage, safePageCount);
  const hasRange = totalItems !== undefined && pageSize !== undefined;
  const rangeStart = totalItems === 0 ? 0 : (safePage - 1) * (pageSize ?? 0) + 1;
  const rangeEnd = Math.min(safePage * (pageSize ?? 0), totalItems ?? 0);

  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <p className="text-xs text-[#888]" aria-live="polite">
        {hasRange ? `${rangeStart}-${rangeEnd} of ${totalItems}` : `Page ${safePage} of ${safePageCount}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={safePage === 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Go to previous page"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        {items.map((item) => item === "ellipsis-start" || item === "ellipsis-end" ? (
          <span key={item} className="flex size-8 items-center justify-center text-[#888]" aria-hidden="true">
            <MoreHorizontal className="size-4" />
          </span>
        ) : (
          <Button
            key={item}
            variant={item === safePage ? "secondary" : "ghost"}
            size="icon"
            className={cn("size-8 text-xs", item === safePage && "border-cyan-300/30 text-cyan-200")}
            aria-label={`Go to page ${item}`}
            aria-current={item === safePage ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={safePage === safePageCount}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Go to next page"
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
