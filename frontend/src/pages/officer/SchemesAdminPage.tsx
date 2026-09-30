import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Copy, Play, Pause, Users } from "lucide-react";
import { listAllSchemesForOfficer, activateScheme, deactivateScheme, duplicateScheme } from "../../services/schemes";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { LoadingState, EmptyState } from "../../components/ui/States";
import { useToast } from "../../components/ui/Toast";
import { apiErrorMessage } from "../../services/api";
import { formatDate, titleCase, SCHEME_STATUS_TONE } from "../../utils/format";
import type { SchemeAdminListItem } from "../../types";

export function SchemesAdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: schemes, isLoading } = useQuery({ queryKey: ["schemes-admin"], queryFn: listAllSchemesForOfficer });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schemes-admin"] });

  const activateMutation = useMutation({
    mutationFn: activateScheme,
    onSuccess: () => {
      showToast("Scheme activated. It is now visible to applicants.", "success");
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });
  const deactivateMutation = useMutation({
    mutationFn: deactivateScheme,
    onSuccess: () => {
      showToast("Scheme deactivated (paused). Applicants can no longer start new applications for it.", "success");
      invalidate();
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });
  const duplicateMutation = useMutation({
    mutationFn: duplicateScheme,
    onSuccess: (copy) => {
      showToast("Scheme duplicated as a new draft.", "success");
      invalidate();
      navigate(`/officer/schemes/${copy.id}/edit`);
    },
    onError: (e) => showToast(apiErrorMessage(e), "error"),
  });

  if (isLoading) return <LoadingState label="Loading schemes..." />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-text">Scholarship & Scheme Management</h1>
          <p className="text-text-secondary">Create, configure and publish scholarship and fellowship schemes.</p>
        </div>
        <Link to="/officer/schemes/new">
          <Button>
            <Plus className="h-4 w-4" /> Add Scheme
          </Button>
        </Link>
      </div>

      {schemes && schemes.length === 0 && (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No schemes created yet." description="Click Add Scheme to publish your first scholarship or fellowship." />
      )}

      {schemes && schemes.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Scheme</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schemes.map((s) => (
                  <SchemeRow
                    key={s.id}
                    scheme={s}
                    onActivate={() => activateMutation.mutate(s.id)}
                    onDeactivate={() => deactivateMutation.mutate(s.id)}
                    onDuplicate={() => duplicateMutation.mutate(s.id)}
                    busy={activateMutation.isPending || deactivateMutation.isPending || duplicateMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {schemes.map((s) => (
              <SchemeCardAdmin
                key={s.id}
                scheme={s}
                onActivate={() => activateMutation.mutate(s.id)}
                onDeactivate={() => deactivateMutation.mutate(s.id)}
                onDuplicate={() => duplicateMutation.mutate(s.id)}
                busy={activateMutation.isPending || deactivateMutation.isPending || duplicateMutation.isPending}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ActionButtons({
  scheme,
  onActivate,
  onDeactivate,
  onDuplicate,
  busy,
}: {
  scheme: SchemeAdminListItem;
  onActivate: () => void;
  onDeactivate: () => void;
  onDuplicate: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link to={`/officer/schemes/${scheme.id}/edit`} title="View / Edit">
        <Button size="sm" variant="outline">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </Link>
      <Button size="sm" variant="outline" onClick={onDuplicate} disabled={busy} title="Duplicate">
        <Copy className="h-3.5 w-3.5" /> Duplicate
      </Button>
      {scheme.status === "ACTIVE" ? (
        <Button size="sm" variant="warning" onClick={onDeactivate} disabled={busy} title="Deactivate">
          <Pause className="h-3.5 w-3.5" /> Deactivate
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={onActivate} disabled={busy} title="Activate">
          <Play className="h-3.5 w-3.5" /> Activate
        </Button>
      )}
    </div>
  );
}

function SchemeRow({
  scheme,
  ...actions
}: {
  scheme: SchemeAdminListItem;
  onActivate: () => void;
  onDeactivate: () => void;
  onDuplicate: () => void;
  busy: boolean;
}) {
  return (
    <tr>
      <td className="px-4 py-3">
        <Link to={`/officer/schemes/${scheme.id}/edit`} className="font-medium text-text hover:text-primary">
          {scheme.name}
        </Link>
        {scheme.is_demo && <Badge tone="neutral" className="ml-2">Demo</Badge>}
      </td>
      <td className="px-4 py-3 text-text-secondary">{titleCase(scheme.scheme_type)}</td>
      <td className="px-4 py-3 text-text-secondary">{scheme.provider}</td>
      <td className="px-4 py-3 text-text-secondary">{formatDate(scheme.deadline)}</td>
      <td className="px-4 py-3 text-text-secondary">
        <span className="font-medium text-text">{scheme.application_counts.total_applications}</span> total
        {scheme.application_counts.pending_review > 0 && <> · {scheme.application_counts.pending_review} pending</>}
        {scheme.application_counts.correction_required > 0 && <> · {scheme.application_counts.correction_required} correction</>}
      </td>
      <td className="px-4 py-3">
        <Badge tone={SCHEME_STATUS_TONE[scheme.status]}>{titleCase(scheme.status)}</Badge>
      </td>
      <td className="px-4 py-3">
        <ActionButtons scheme={scheme} {...actions} />
      </td>
    </tr>
  );
}

function SchemeCardAdmin({
  scheme,
  ...actions
}: {
  scheme: SchemeAdminListItem;
  onActivate: () => void;
  onDeactivate: () => void;
  onDuplicate: () => void;
  busy: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <Link to={`/officer/schemes/${scheme.id}/edit`} className="font-medium text-text hover:text-primary">
            {scheme.name}
          </Link>
          <p className="text-xs text-text-secondary">
            {titleCase(scheme.scheme_type)} · {scheme.provider}
          </p>
        </div>
        <Badge tone={SCHEME_STATUS_TONE[scheme.status]}>{titleCase(scheme.status)}</Badge>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
        <span>Deadline: {formatDate(scheme.deadline)}</span>
        <span>{scheme.application_counts.total_applications} applications</span>
        {scheme.application_counts.pending_review > 0 && <span>{scheme.application_counts.pending_review} pending</span>}
      </div>
      <ActionButtons scheme={scheme} {...actions} />
    </div>
  );
}
