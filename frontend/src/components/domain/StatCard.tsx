import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "primary" | "success" | "warning" | "danger" | "secondary";
}) {
  const toneClasses = {
    primary: "bg-primary-light text-primary",
    success: "bg-success-light text-success",
    warning: "bg-warning-light text-warning",
    danger: "bg-danger-light text-danger",
    secondary: "bg-secondary-light text-secondary",
  }[tone];

  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={cn("rounded-xl p-3", toneClasses)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-text">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
