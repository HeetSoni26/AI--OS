import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDirection = "ascending" | "descending" | null;

export function DataTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="surface-scrollbar w-full overflow-x-auto rounded-xl border border-[#2A2E45]">
      <table className={cn("w-full border-collapse text-left text-xs", className)} {...props} />
    </div>
  );
}

export function DataTableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-[#111533] text-[#C5C8DB]", className)} {...props} />;
}

export function DataTableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-[#2A2E45]", className)} {...props} />;
}

export function DataTableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-white/[0.025]", className)} {...props} />;
}

export function DataTableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("h-10 px-4 font-medium", className)} {...props} />;
}

export function DataTableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-[#C5C8DB]", className)} {...props} />;
}

export function DataTableSortableHeader({
  direction,
  onSort,
  children,
  className,
  disabled,
  ...props
}: Omit<ThHTMLAttributes<HTMLTableCellElement>, "aria-sort" | "onClick"> & {
  direction: SortDirection;
  onSort: () => void;
  disabled?: boolean;
}) {
  const Icon = direction === "ascending"
    ? ChevronUp
    : direction === "descending"
      ? ChevronDown
      : ChevronsUpDown;
  const nextDirection = direction === "ascending" ? "descending" : "ascending";

  return (
    <th
      scope="col"
      aria-sort={direction ?? "none"}
      className={cn("h-10 px-2 font-medium", className)}
      {...props}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSort}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[#C5C8DB] transition-colors hover:bg-white/5 hover:text-[#F3F5FF] disabled:pointer-events-none"
        aria-label={`${typeof children === "string" ? children : "Column"}: sort ${nextDirection}`}
      >
        <span>{children}</span>
        <Icon aria-hidden="true" className="size-3.5 text-[#888]" />
      </button>
    </th>
  );
}
