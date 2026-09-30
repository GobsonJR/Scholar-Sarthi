import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { listAuditLogs } from "../../services/notifications";
import { LoadingState, EmptyState } from "../../components/ui/States";
import { formatDateTime } from "../../utils/format";

export function AuditLogsPage() {
  const { data: logs, isLoading } = useQuery({ queryKey: ["audit-logs", "all"], queryFn: () => listAuditLogs() });

  if (isLoading) return <LoadingState label="Loading audit logs..." />;

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold text-text">Audit Logs</h1>
      <p className="mb-6 text-text-secondary">A complete, timestamped trail of every action taken across applications.</p>

      {!logs || logs.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No activity yet" />
      ) : (
        <div className="card divide-y divide-border p-0">
          {logs.map((log) => (
            <div key={log.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text">{log.action}</p>
                <p className="whitespace-nowrap text-xs text-text-secondary">{formatDateTime(log.created_at)}</p>
              </div>
              {log.details && <p className="mt-1 text-sm text-text-secondary">{log.details}</p>}
              <p className="mt-1 text-xs text-text-secondary/70">By {log.actor_name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
