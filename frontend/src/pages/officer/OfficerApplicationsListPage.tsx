import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, FolderKanban, ArrowUpDown } from "lucide-react";
import { listOfficerApplications } from "../../services/officer";
import { listSchemes } from "../../services/schemes";
import { SearchBar } from "../../components/ui/SearchBar";
import { Select } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/Badge";
import { LoadingState, EmptyState, ErrorState } from "../../components/ui/States";
import { formatDate, STATUS_LABELS } from "../../utils/format";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { cn } from "../../utils/cn";

export function OfficerApplicationsListPage({ flaggedOnly = false }: { flaggedOnly?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("");
  const [schemeId, setSchemeId] = useState("");
  const [flaggedToggle, setFlaggedToggle] = useState(flaggedOnly);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);

  const { data: schemes } = useQuery({ queryKey: ["schemes-all"], queryFn: () => listSchemes() });
  const { data: applications, isLoading, isError } = useQuery({
    queryKey: ["officer-apps", { debouncedSearch, status, schemeId, flaggedToggle }],
    queryFn: () =>
      listOfficerApplications({
        search: debouncedSearch || undefined,
        status: status || undefined,
        scheme_id: schemeId || undefined,
        flagged: flaggedToggle ? true : undefined,
      }),
  });

  const sorted = useMemo(() => {
    if (!applications) return [];
    const copy = [...applications];
    copy.sort((a, b) => {
      const diff = new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return sortNewestFirst ? diff : -diff;
    });
    return copy;
  }, [applications, sortNewestFirst]);

  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 text-2xl font-semibold text-text">{flaggedOnly ? "Flagged Applications" : "Applications"}</h1>
      <p className="mb-6 text-text-secondary">
        {flaggedOnly ? "Applications with a verification flag or cross-document mismatch." : "All submitted applications across every scheme."}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by applicant or application ID" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS)
            .filter(([k]) => k !== "DRAFT")
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </Select>
        <Select value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
          <option value="">All schemes</option>
          {schemes?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFlaggedToggle((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium",
            flaggedToggle ? "border-amber-300 bg-warning-light text-warning" : "border-border bg-white text-text-secondary hover:bg-slate-50",
          )}
        >
          <ShieldAlert className="h-3.5 w-3.5" /> Verification Flag Only
        </button>
        <button
          onClick={() => setSortNewestFirst((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50"
        >
          <ArrowUpDown className="h-3.5 w-3.5" /> {sortNewestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {isLoading && <LoadingState label="Loading applications..." />}
      {isError && <ErrorState message="We couldn't load applications. Please try again." />}

      {sorted && sorted.length === 0 && !isLoading && (
        <EmptyState icon={flaggedOnly ? <ShieldAlert className="h-6 w-6" /> : <FolderKanban className="h-6 w-6" />} title="No applications found" description="Try adjusting your filters." />
      )}

      {sorted && sorted.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-white lg:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Application</th>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Scheme</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer hover:bg-slate-50"
                    tabIndex={0}
                    role="button"
                    onClick={() => navigate(`/officer/applications/${a.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/officer/applications/${a.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-text">{a.display_id}</td>
                    <td className="px-4 py-3">
                      <p className="text-text">{a.applicant_name}</p>
                      <p className="text-xs text-text-secondary">{a.applicant_email}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{a.scheme_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{a.submitted_at ? formatDate(a.submitted_at) : "—"}</td>
                    <td className="px-4 py-3">{a.flagged && <ShieldAlert className="h-4 w-4 text-warning" aria-label="Flagged" />}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {sorted.map((a) => (
              <Link key={a.id} to={`/officer/applications/${a.id}`} className="card flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-text">{a.applicant_name}</p>
                    <p className="text-xs text-text-secondary">
                      {a.display_id} · {a.scheme_name}
                    </p>
                  </div>
                  {a.flagged && <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-label="Flagged" />}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{a.submitted_at ? formatDate(a.submitted_at) : "Not submitted"}</span>
                  <StatusBadge status={a.status} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
