import { cn } from "../../utils/cn";

export function ProgressBar({ value, tone = "primary", className }: { value: number; tone?: "primary" | "success" | "warning" | "danger"; className?: string }) {
  const toneClasses = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={cn("h-full rounded-full transition-all duration-300", toneClasses)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
