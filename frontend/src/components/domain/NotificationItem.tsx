import { Bell, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import type { Notification } from "../../types";
import { formatDateTime } from "../../utils/format";
import { cn } from "../../utils/cn";

const iconMap: Record<string, typeof Bell> = {
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: XCircle,
  INFO: Info,
};

const colorMap: Record<string, string> = {
  SUCCESS: "text-success bg-success-light",
  WARNING: "text-warning bg-warning-light",
  ERROR: "text-danger bg-danger-light",
  INFO: "text-primary bg-primary-light",
};

export function NotificationItem({ notification, onClick }: { notification: Notification; onClick?: () => void }) {
  const Icon = iconMap[notification.type] ?? Bell;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-slate-50",
        !notification.is_read && "bg-primary-light/40",
      )}
    >
      <span className={cn("mt-0.5 rounded-full p-2", colorMap[notification.type] ?? colorMap.INFO)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text">{notification.title}</p>
          {!notification.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
        </div>
        <p className="mt-0.5 text-sm text-text-secondary">{notification.message}</p>
        <p className="mt-1 text-xs text-text-secondary/70">{formatDateTime(notification.created_at)}</p>
      </div>
    </button>
  );
}
