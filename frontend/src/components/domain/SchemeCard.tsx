import { Link } from "react-router-dom";
import { Calendar, IndianRupee, GraduationCap, FileText } from "lucide-react";
import type { Scheme } from "../../types";
import { formatDate, formatMoney, daysUntil, titleCase, schemeLifecycleLabel } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export function SchemeCard({ scheme, basePath }: { scheme: Scheme; basePath: string }) {
  const days = daysUntil(scheme.deadline);
  const urgent = days !== null && days <= 14 && days >= 0;
  const lifecycle = schemeLifecycleLabel(scheme);

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-secondary">{scheme.provider}</p>
          <h3 className="mt-0.5 font-semibold text-text">{scheme.name}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
          {scheme.is_demo && <Badge tone="neutral">Demo Scheme</Badge>}
        </div>
      </div>
      <p className="mb-3 text-sm text-text-secondary">{scheme.short_description}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge tone="info">{titleCase(scheme.scheme_type)}</Badge>
        <Badge tone="neutral">{scheme.education_level}</Badge>
        {scheme.eligible_categories && <Badge tone="neutral">{scheme.eligible_categories.join("/")}</Badge>}
      </div>

      <div className="mb-4 space-y-1.5 text-sm text-text-secondary">
        <p className="flex items-center gap-2">
          <IndianRupee className="h-3.5 w-3.5" /> Max income: {scheme.income_limit ? formatMoney(scheme.income_limit) : "No limit"}
        </p>
        <p className="flex items-center gap-2">
          <GraduationCap className="h-3.5 w-3.5" /> Benefit: {scheme.benefit_amount}
        </p>
        <p className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5" /> {scheme.required_documents.length} document{scheme.required_documents.length === 1 ? "" : "s"} required
        </p>
        <p className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" /> Deadline: {formatDate(scheme.deadline)}
          {urgent && <span className="font-medium text-warning">· {days} day{days === 1 ? "" : "s"} left</span>}
        </p>
      </div>

      <div className="mt-auto flex gap-2">
        <Link to={`${basePath}/${scheme.id}`} className="flex-1">
          <Button variant="outline" className="w-full">
            View Scheme
          </Button>
        </Link>
        <Link to={`${basePath}/${scheme.id}`} className="flex-1">
          <Button className="w-full">Check Eligibility</Button>
        </Link>
      </div>
    </div>
  );
}
