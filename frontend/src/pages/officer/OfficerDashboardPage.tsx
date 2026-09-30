import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, FolderKanban, Clock, AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";
import { getOfficerStatistics, listOfficerApplications } from "../../services/officer";
import { StatCard } from "../../components/domain/StatCard";
import { LoadingState } from "../../components/ui/States";
import { StatusBadge } from "../../components/ui/Badge";
import { formatDate, titleCase } from "../../utils/format";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#94a3b8",
  SUBMITTED: "#2563eb",
  UNDER_VERIFICATION: "#3b82f6",
  CORRECTION_REQUIRED: "#d97706",
  RESUBMITTED: "#0ea5e9",
  UNDER_OFFICER_REVIEW: "#0f766e",
  APPROVED: "#16a34a",
  REJECTED: "#dc2626",
};

export function OfficerDashboardPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["officer-stats"], queryFn: getOfficerStatistics });
  const { data: recent } = useQuery({ queryKey: ["officer-apps", "recent"], queryFn: () => listOfficerApplications() });

  const needsAttention = useMemo(() => {
    if (!recent) return [];
    const actionable = recent.filter((a) => !["APPROVED", "REJECTED"].includes(a.status));
    return actionable
      .filter((a) => a.flagged)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 4);
  }, [recent]);

  if (isLoading || !stats) return <LoadingState label="Loading officer overview..." />;

  const pieData = stats.status_distribution.map((s) => ({ name: titleCase(s.status), value: s.count, key: s.status }));

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text">Officer Overview</h1>
        <p className="mt-1 text-text-secondary">Monitor application processing and verification flags across all schemes.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={FolderKanban} label="Total Applications" value={stats.total_applications} tone="primary" />
        <StatCard icon={Clock} label="Pending Review" value={stats.pending_review} tone="secondary" />
        <StatCard icon={AlertTriangle} label="Correction Required" value={stats.correction_required} tone="warning" />
        <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="success" />
        <StatCard icon={XCircle} label="Rejected" value={stats.rejected} tone="danger" />
      </div>

      {needsAttention.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text">
            <ShieldAlert className="h-5 w-5 text-warning" /> Needs Attention
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {needsAttention.map((a) => (
              <Link key={a.id} to={`/officer/applications/${a.id}`} className="card flex items-center justify-between gap-3 border-amber-200 bg-warning-light/30 p-4 hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{a.applicant_name}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {a.display_id} · {a.scheme_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-primary">
                  Review <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-text">Applications Over Time</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthly_applications}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold text-text">Applications by Status</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={STATUS_COLORS[entry.key] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-text">Document Verification</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <p className="text-xs text-text-secondary">Total Documents</p>
            <p className="text-xl font-semibold text-text">{stats.document_verification.total_documents}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Verified</p>
            <p className="text-xl font-semibold text-success">{stats.document_verification.verified}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Needs Review</p>
            <p className="text-xl font-semibold text-warning">{stats.document_verification.needs_review}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">Verification Failed</p>
            <p className="text-xl font-semibold text-danger">{stats.document_verification.verification_failed}</p>
          </div>
          <div>
            <p className="text-xs text-text-secondary">High-Risk Flags</p>
            <p className="text-xl font-semibold text-danger">{stats.document_verification.high_risk_flags}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-secondary">
          "High-risk flags" are automated verification-risk indicators requiring officer review — not confirmed fraud.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-text">
            <ShieldAlert className="h-4 w-4 text-warning" /> Document Issue Frequency
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.document_issue_frequency} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="status" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-text">Recent Applications</h2>
            <Link to="/officer/applications" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recent?.slice(0, 6).map((a) => (
              <Link key={a.id} to={`/officer/applications/${a.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{a.applicant_name}</p>
                  <p className="text-xs text-text-secondary">
                    {a.display_id} · {a.scheme_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.flagged && <span className="h-2 w-2 rounded-full bg-warning" title="Flagged" />}
                  <StatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-text-secondary">
        Average processing time: <span className="font-medium text-text">{stats.avg_processing_days} days</span> from submission to
        decision, based on {stats.approved + stats.rejected} completed applications. Data as of {formatDate(new Date().toISOString())}.
      </p>
    </div>
  );
}
