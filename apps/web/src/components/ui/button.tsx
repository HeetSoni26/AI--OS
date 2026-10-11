import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
};

const variants = {
  primary: "border-cyan-300/50 bg-cyan-300 text-[#071014] hover:bg-cyan-200 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)]",
  secondary: "border-[#2A2E45] bg-[#111533] text-[#F3F5FF] hover:border-cyan-300/40 hover:bg-[#171B3D]",
  ghost: "border-transparent bg-transparent text-[#888] hover:bg-white/5 hover:text-[#F3F5FF]",
  danger: "border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/15",
};

const sizes = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "size-9 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-medium transition-[color,background-color,border-color,box-shadow] duration-200 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
