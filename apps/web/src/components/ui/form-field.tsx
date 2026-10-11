import {
  cloneElement,
  isValidElement,
  useId,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type FieldControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<FieldControlProps>;
  className?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId]
    .filter(Boolean)
    .join(" ") || undefined;

  if (!isValidElement<FieldControlProps>(children)) {
    throw new Error("FormField requires a single form control child");
  }

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={fieldId} className="text-xs font-medium text-[#C5C8DB]">
        {label}
        {required ? <span className="ml-1 text-cyan-300" aria-hidden="true">*</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {cloneElement(children, {
        id: fieldId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {hint ? <div id={hintId} className="text-xs text-[#888]">{hint}</div> : null}
      {error ? <div id={errorId} role="alert" className="text-xs text-red-300">{error}</div> : null}
    </div>
  );
}

export type ErrorSummaryItem = {
  id: string;
  message: ReactNode;
};

export function ErrorSummary({
  errors,
  title = "There is a problem",
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  errors: ErrorSummaryItem[];
  title?: ReactNode;
}) {
  const titleId = useId();
  if (errors.length === 0) return null;

  return (
    <div
      role="alert"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn("rounded-xl border border-red-400/40 bg-red-400/[0.07] p-4 text-red-200", className)}
      {...props}
    >
      <div className="flex items-center gap-2 text-sm font-semibold" id={titleId}>
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {title}
      </div>
      <ul className="mt-2 grid list-disc gap-1 pl-5 text-xs">
        {errors.map((error) => (
          <li key={error.id}>
            <a className="underline decoration-red-300/50 underline-offset-2 hover:text-red-100" href={`#${error.id}`}>
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
