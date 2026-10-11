import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, id, label, hint, error, ...props },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label className="flex items-start gap-2.5 text-xs text-[#C5C8DB]" htmlFor={fieldId}>
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="mt-0.5 size-4 shrink-0 appearance-none rounded border border-[#3A3E59] bg-[#0C1020] bg-center bg-no-repeat transition-[background-color,border-color,box-shadow] checked:border-cyan-300 checked:bg-cyan-300 checked:bg-[url('data:image/svg+xml,%3Csvg_viewBox=%220_0_16_16%22_xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath_d=%22m3.5_8_3_3_6-7%22_fill=%22none%22_stroke=%22%2307080f%22_stroke-linecap=%22round%22_stroke-linejoin=%22round%22_stroke-width=%222%22/%3E%3C/svg%3E')] disabled:opacity-50"
          {...props}
        />
        <span className="leading-5">{label}</span>
      </label>
      {hint ? <span id={`${fieldId}-hint`} className="pl-6.5 text-xs text-[#888]">{hint}</span> : null}
      {error ? <span id={`${fieldId}-error`} role="alert" className="pl-6.5 text-xs text-red-300">{error}</span> : null}
    </div>
  );
});
