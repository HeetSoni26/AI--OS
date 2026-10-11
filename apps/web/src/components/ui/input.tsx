import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, id, label, hint, error, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...props },
  ref,
) {
  const describedBy = [ariaDescribedBy, hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const control = (
    <input
      ref={ref}
      id={id}
      aria-invalid={error ? true : ariaInvalid}
      aria-describedby={describedBy}
      className={cn(
        "h-10 w-full rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 text-sm text-[#F3F5FF] placeholder:text-[#888] hover:border-[#3A3E59] focus:border-cyan-300/60 focus:outline-none disabled:opacity-50",
        error && "border-red-400/60",
        className,
      )}
      {...props}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <div className="grid gap-1.5">
      {label ? <label className="text-xs font-medium text-[#C5C8DB]" htmlFor={id}>{label}</label> : null}
      {control}
      {hint ? <span id={`${id}-hint`} className="text-xs text-[#888]">{hint}</span> : null}
      {error ? <span id={`${id}-error`} role="alert" className="text-xs text-red-300">{error}</span> : null}
    </div>
  );
});
