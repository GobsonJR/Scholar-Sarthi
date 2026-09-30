import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { FolderOpen, Clock, AlertTriangle, CheckCircle2, ArrowRight, Calendar, FileStack } from "lucide-react";
import { listApplications, getApplication } from "../../services/applications";
import { useAuth } from "../../hooks/useAuth";
import { StatCard } from "../../components/domain/StatCard";
import { StatusBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingState, EmptyState, ErrorState } from "../../components/ui/States";
import { formatDate, daysUntil } from "../../utils/format";
import { listNotifications } from "../../services/notifications";
import { primaryActionForStatus } from "../../utils/status";

const IN_PROGRESS = new Set(["SUBMITTED", "UNDER_VERIFICATION", "UNDER_OFFICER_REVIEW", "RESUBMITTED"]);

export function DashboardPage() {
  const { user } = useAuth();
  const { data: applications, isLoading, isError } = useQuery({ queryKey: ["applications"], queryFn: listApplications });

  const stats = useMemo(() => {
    if (!applications) return null;
    const nonDraft = applications.filter((a) => a.status !== "DRAFT");
    return {
      total: nonDraft.length,
      underVerification: applications.filter((a) => IN_PROGRESS.has(a.status)).length,
      correction: applications.filter((a) => a.status === "CORRECTION_REQUIRED").length,
      approved: applications.filter((a) => a.status === "APPROVED").length,
    };
  }, [applications]);

  const actionItems = useMemo(() => {
    if (!applications) return [];
    return applications
      .filter((a) => a.status === "CORRECTION_REQUIRED")
      .map((a) => ({ application: a }));
  }, [applications]);

  const upcomingDeadlines = useMemo(() => {
    if (!applications) return [];
    return applications
      .filter((a) => a.scheme && a.status === "DRAFT")
      .map((a) => ({ app: a, days: daysUntil(a.scheme!.deadline) }))
      .filter((x) => x.days !== null && x.days >= 0)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0))
      .slice(0, 4);
  }, [applications]);

  const { data: recentActivity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: listNotifications,
  });

  const nonDraftApps = useMemo(() => (applications ?? []).filter((a) => a.status !== "DRAFT"), [applications]);
  const detailQueries = useQueries({
    queries: nonDraftApps.map((a) => ({ queryKey: ["application", a.id], queryFn: () => getApplication(a.id), enabled: !!applications })),
  });
  const docStats = useMemo(() => {
    const allDocs = detailQueries.flatMap((q) => q.data?.documents ?? []);
    const requiredCount = detailQueries.reduce((sum, q) => sum + (q.data?.scheme?.required_documents.length ?? 0), 0);
    return {
      required: requiredCount,
      uploaded: allDocs.length,
      verified: allDocs.filter((d) => d.status === "VERIFIED").length,
      needsReview: allDocs.filter((d) => d.status === "NEEDS_REVIEW" || d.status === "INVALID").length,
      flaggedDocs: allDocs.filter((d) => d.status === "NEEDS_REVIEW" || d.status === "INVALID"),
    };
  }, [detailQueries]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (isLoading) return <LoadingState label="Loading your dashboard..." />;
  if (isError) return <ErrorState message="We couldn't load your dashboard. Please try again." />;

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">
          {greeting}, {user?.full_name?.split(" ")[0]}
        </h1>
        <p className="mt-1 text-text-secondary">Track your scholarship applications and complete pending actions.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={FolderOpen} label="Total Applications" value={stats.total} tone="primary" />
          <StatCard icon={Clock} label="Under Verification" value={stats.underVerification} tone="secondary" />
          <StatCard icon={AlertTriangle} label="Correction Required" value={stats.correction} tone="warning" />
          <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="success" />
        </div>
      )}

      {actionItems.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-text">Action Required</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {actionItems.map(({ application }) => (
              <div key={application.id} className="card border-amber-200 bg-warning-light/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text">{application.scheme?.name}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">Application {application.display_id} needs a correction before it can proceed.</p>
                  </div>
                  <StatusBadge status={application.status} />
                </div>
                <Link to={`/app/applications/${application.id}`}>
                  <Button size="sm" className="mt-3">
                    Fix Document <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">My Applications</h2>
          <Link to="/app/applications" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        {applications && applications.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Discover a scheme you're eligible for and start your first application."
            action={
              <Link to="/app/schemes">
                <Button>Discover Schemes</Button>
              </Link>
            }
          />
        ) : (
          <div className="card divide-y divide-border p-0">
            {applications?.slice(0, 5).map((a) => {
              const action = primaryActionForStatus(a.status);
              return (
                <div key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{a.scheme?.name}</p>
                    <p className="text-xs text-text-secondary">{a.display_id} · Deadline {a.scheme && formatDate(a.scheme.deadline)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <StatusBadge status={a.status} />
                    <Link to={action.to(a.id)}>
                      <Button size="sm" variant="outline">
                        {action.label}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {nonDraftApps.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text">
            <FileStack className="h-5 w-5" /> Document Status
          </h2>
          <div className="card p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-text-secondary">Required</p>
                <p className="text-xl font-semibold text-text">{docStats.required}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Uploaded</p>
                <p className="text-xl font-semibold text-text">{docStats.uploaded}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Verified</p>
                <p className="text-xl font-semibold text-success">{docStats.verified}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Needs Review</p>
                <p className="text-xl font-semibold text-warning">{docStats.needsReview}</p>
              </div>
            </div>
            {docStats.flaggedDocs.length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                {docStats.flaggedDocs.slice(0, 3).map((d) => (
                  <Link key={d.id} to={`/app/applications/${d.application_id}`} className="flex items-center gap-1.5 text-xs text-text hover:underline">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                    {d.doc_type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} requires officer review.
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text">
            <Calendar className="h-5 w-5" /> Upcoming Deadlines
          </h2>
          {upcomingDeadlines.length === 0 ? (
            <p className="card p-4 text-sm text-text-secondary">No draft applications with upcoming deadlines.</p>
          ) : (
            <div className="card divide-y divide-border p-0">
              {upcomingDeadlines.map(({ app, days }) => (
                <div key={app.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-text">{app.scheme?.name}</p>
                    <p className="text-xs text-text-secondary">{app.scheme && formatDate(app.scheme.deadline)}</p>
                  </div>
                  <span className="text-xs font-medium text-warning">{days} days left</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-text">Recent Activity</h2>
          {!recentActivity || recentActivity.length === 0 ? (
            <p className="card p-4 text-sm text-text-secondary">Activity from your applications will show up here.</p>
          ) : (
            <div className="card max-h-72 divide-y divide-border overflow-y-auto p-0">
              {recentActivity.slice(0, 8).map((n) => (
                <div key={n.id} className="p-3.5 text-sm">
                  <p className="text-text">{n.title}</p>
                  <p className="text-xs text-text-secondary">{formatDate(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
