import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, label, hint, children, ...props },
  ref,
) {
  const control = (
    <span className="relative block">
      <select
        ref={ref}
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn("h-10 w-full appearance-none rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 pr-9 text-sm text-[#F3F5FF] hover:border-[#3A3E59] focus:border-cyan-300/60 focus:outline-none", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#888]" />
    </span>
  );

  if (!label && !hint) return control;

  return (
    <div className="grid gap-1.5">
      {label ? <label className="text-xs font-medium text-[#C5C8DB]" htmlFor={id}>{label}</label> : null}
      {control}
      {hint ? <span id={`${id}-hint`} className="text-xs text-[#888]">{hint}</span> : null}
    </div>
  );
});
