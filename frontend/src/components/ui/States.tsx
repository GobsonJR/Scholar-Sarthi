import type { ReactNode } from "react";
import { Loader2, Inbox, AlertTriangle } from "lucide-react";

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-text-secondary">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white px-6 py-14 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-text-secondary">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div>
        <p className="font-medium text-text">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message = "We couldn't load this information. Please try again." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-danger-light px-6 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-danger" />
      <p className="text-sm text-danger">{message}</p>
    </div>
  );
}

export function SkeletonBlock({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />;
}
