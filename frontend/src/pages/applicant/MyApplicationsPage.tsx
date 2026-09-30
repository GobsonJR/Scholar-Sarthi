import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderOpen } from "lucide-react";
import { listApplications } from "../../services/applications";
import { StatusBadge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Input";
import { LoadingState, EmptyState, ErrorState } from "../../components/ui/States";
import { Button } from "../../components/ui/Button";
import { formatDate } from "../../utils/format";
import { STATUS_LABELS } from "../../utils/format";
import { primaryActionForStatus } from "../../utils/status";

export function MyApplicationsPage() {
  const { data: applications, isLoading, isError } = useQuery({ queryKey: ["applications"], queryFn: listApplications });
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    if (!applications) return [];
    return statusFilter ? applications.filter((a) => a.status === statusFilter) : applications;
  }, [applications, statusFilter]);

  if (isLoading) return <LoadingState label="Loading your applications..." />;
  if (isError) return <ErrorState message="We couldn't load your applications. Please try again." />;

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text">My Applications</h1>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6" />}
          title="No applications found"
          description="Try a different filter, or discover a new scheme to apply to."
          action={
            <Link to="/app/schemes">
              <Button>Discover Schemes</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const action = primaryActionForStatus(a.status);
            return (
              <div key={a.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{a.scheme?.name}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {a.display_id} · Submitted {a.submitted_at ? formatDate(a.submitted_at) : "Not yet submitted"} · Deadline{" "}
                    {a.scheme && formatDate(a.scheme.deadline)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge status={a.status} />
                  <Link to={action.to(a.id)}>
                    <Button size="sm" variant="outline" className="whitespace-nowrap">
                      {action.label} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
