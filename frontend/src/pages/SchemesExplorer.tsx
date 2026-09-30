import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSchemes } from "../services/schemes";
import { SearchBar } from "../components/ui/SearchBar";
import { Select } from "../components/ui/Input";
import { SchemeCard } from "../components/domain/SchemeCard";
import { LoadingState, EmptyState, ErrorState } from "../components/ui/States";
import { Search } from "lucide-react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

export function SchemesExplorer({ basePath }: { basePath: string }) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [category, setCategory] = useState("");
  const [educationLevel, setEducationLevel] = useState("");
  const [schemeType, setSchemeType] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [institutionType, setInstitutionType] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "CLOSED">("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["schemes", { debouncedSearch, category, educationLevel, schemeType, stateFilter, institutionType, statusFilter }],
    queryFn: () =>
      listSchemes({
        search: debouncedSearch || undefined,
        category: category || undefined,
        education_level: educationLevel || undefined,
        scheme_type: schemeType || undefined,
        state: stateFilter || undefined,
        institution_type: institutionType || undefined,
        status: statusFilter || undefined,
      }),
  });

  const categories = useMemo(() => Array.from(new Set(data?.map((s) => s.category) ?? [])), [data]);
  const educationLevels = useMemo(() => Array.from(new Set(data?.map((s) => s.education_level) ?? [])), [data]);
  const states = useMemo(() => Array.from(new Set(data?.map((s) => s.state) ?? [])), [data]);
  const institutionTypes = useMemo(() => Array.from(new Set(data?.map((s) => s.institution_type) ?? [])), [data]);
  const hasActiveFilters = !!(search || category || educationLevel || schemeType || stateFilter || institutionType || statusFilter);

  const clearFilters = () => {
    setSearch("");
    setCategory("");
    setEducationLevel("");
    setSchemeType("");
    setStateFilter("");
    setInstitutionType("");
    setStatusFilter("");
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text">Scholarships & Fellowships</h1>
        <p className="mt-1 text-sm text-text-secondary">Find schemes you may be eligible for and understand what you need before applying.</p>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, provider, category..." className="lg:col-span-2" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select value={educationLevel} onChange={(e) => setEducationLevel(e.target.value)}>
          <option value="">All education levels</option>
          {educationLevels.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select value={institutionType} onChange={(e) => setInstitutionType(e.target.value)}>
          <option value="">All institution types</option>
          {institutionTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="">Open schemes</option>
          <option value="CLOSED">Closed schemes</option>
        </Select>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {["", "scholarship", "fellowship"].map((t) => (
          <button
            key={t || "all"}
            onClick={() => setSchemeType(t)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              schemeType === t ? "border-primary bg-primary-light text-primary" : "border-border bg-white text-text-secondary hover:bg-slate-50"
            }`}
          >
            {t === "" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1) + "s"}
          </button>
        ))}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm font-medium text-secondary hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {isLoading && <LoadingState label="Loading schemes..." />}
      {isError && <ErrorState message="Could not load schemes right now." />}
      {data && data.length === 0 && (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title={hasActiveFilters ? "No schemes match your filters" : "No scholarships available right now."}
          description={hasActiveFilters ? "Try clearing a filter or searching a different term." : "Check back soon — new schemes are added regularly."}
        />
      )}

      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((scheme) => (
            <SchemeCard key={scheme.id} scheme={scheme} basePath={basePath} />
          ))}
        </div>
      )}
    </div>
  );
}
