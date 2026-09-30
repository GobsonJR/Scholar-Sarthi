import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { getOfficerStatistics, downloadReport } from "../../services/officer";
import { StatCard } from "../../components/domain/StatCard";
import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/States";
import { CheckCircle2, XCircle, MessageSquareWarning, Clock } from "lucide-react";

export function ReportsPage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["officer-stats"], queryFn: getOfficerStatistics });

  if (isLoading || !stats) return <LoadingState label="Loading reports..." />;

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text">Reports</h1>
          <p className="mt-1 text-text-secondary">Processing summary across all schemes.</p>
        </div>
        <Button variant="outline" onClick={() => downloadReport()}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Approved" value={stats.approved} tone="success" />
        <StatCard icon={XCircle} label="Rejected" value={stats.rejected} tone="danger" />
        <StatCard icon={MessageSquareWarning} label="Correction Requests" value={stats.correction_required} tone="warning" />
        <StatCard icon={Clock} label="Avg. Processing (days)" value={stats.avg_processing_days} tone="secondary" />
      </div>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-text">Monthly Applications</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={stats.monthly_applications}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold text-text">Document Issue Frequency</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.document_issue_frequency}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="status" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
