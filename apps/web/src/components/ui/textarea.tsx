import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, label, hint, error, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      {label ? <label htmlFor={fieldId} className="text-xs font-medium text-[#C5C8DB]">{label}</label> : null}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-24 w-full resize-y rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 py-2.5 text-sm text-[#F3F5FF] placeholder:text-[#888] hover:border-[#3A3E59] focus:border-cyan-300/60 focus:outline-none disabled:opacity-50",
          error && "border-red-400/60",
          className,
        )}
        {...props}
      />
      {hint ? <span id={`${fieldId}-hint`} className="text-xs text-[#888]">{hint}</span> : null}
      {error ? <span id={`${fieldId}-error`} role="alert" className="text-xs text-red-300">{error}</span> : null}
    </div>
  );
});
