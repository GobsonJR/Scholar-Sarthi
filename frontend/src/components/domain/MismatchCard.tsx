import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { Mismatch } from "../../types";
import { titleCase } from "../../utils/format";
import { Badge } from "../ui/Badge";
import { cn } from "../../utils/cn";

function referenceDocType(m: Mismatch): string | undefined {
  const identity = m.values.find((v) => v.doc_type === "IDENTITY_PROOF");
  return (identity ?? m.values[0])?.doc_type;
}

function rowMatches(value: unknown, reference: unknown): boolean {
  if (value === reference) return true;
  return String(value).trim().toLowerCase() === String(reference).trim().toLowerCase();
}

export function MismatchTable({ mismatches }: { mismatches: Mismatch[] }) {
  if (mismatches.length === 0) {
    return <p className="text-sm text-text-secondary">No fields were common enough across documents to compare yet.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-2.5">Field</th>
              <th className="px-4 py-2.5">Document</th>
              <th className="px-4 py-2.5">Value</th>
              <th className="px-4 py-2.5 text-right">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mismatches.map((m) => {
              const refDocType = referenceDocType(m);
              const referenceValue = m.values.find((v) => v.doc_type === refDocType)?.value;
              return m.values.map((v, idx) => {
                const isReference = v.doc_type === refDocType;
                const matches = !m.is_mismatch || isReference || rowMatches(v.value, referenceValue);
                return (
                  <tr key={`${m.field}-${v.doc_type}`} className={cn(idx === 0 && "border-t-2 border-t-slate-200")}>
                    {idx === 0 ? (
                      <td className="px-4 py-2.5 align-top font-medium text-text" rowSpan={m.values.length}>
                        {titleCase(m.field)}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5 text-text-secondary">{titleCase(v.doc_type)}</td>
                    <td className="px-4 py-2.5 font-medium text-text">{String(v.value)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isReference ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
                          <CheckCircle2 className="h-4 w-4 text-success" /> Reference
                        </span>
                      ) : matches ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="h-4 w-4" /> Match
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                          <AlertTriangle className="h-4 w-4" /> Possible mismatch
                        </span>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2">
        {mismatches.map((m) => (
          <div key={m.field} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
            {m.is_mismatch ? (
              <Badge tone={m.severity === "high" ? "danger" : "warning"} className="mt-0.5 shrink-0">
                <AlertTriangle className="h-3 w-3" /> Possible Mismatch
              </Badge>
            ) : (
              <Badge tone="success" className="mt-0.5 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> Match
              </Badge>
            )}
            <p className="text-text-secondary">{m.explanation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
