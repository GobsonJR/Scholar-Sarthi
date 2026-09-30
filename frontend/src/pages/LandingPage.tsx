import { Link } from "react-router-dom";
import {
  GraduationCap,
  UploadCloud,
  ScanSearch,
  ShieldCheck,
  MessageSquareText,
  UserCheck,
  ArrowRight,
  Eye,
  LockKeyhole,
} from "lucide-react";

const workflow = [
  { icon: UploadCloud, label: "Upload" },
  { icon: ScanSearch, label: "Verify" },
  { icon: ShieldCheck, label: "Check" },
  { icon: MessageSquareText, label: "Explain" },
  { icon: UserCheck, label: "Review" },
];

const sections = [
  {
    icon: GraduationCap,
    title: "For Applicants",
    description: "Track applications, understand exactly what's blocking approval, and fix issues without guesswork.",
  },
  {
    icon: UserCheck,
    title: "For Officers",
    description: "Review AI-extracted fields, flags and rule outcomes side-by-side, then approve, reject, or request a correction.",
  },
  {
    icon: ScanSearch,
    title: "Explainable Verification",
    description: "Document reading, quality checks and cross-document mismatch detection — each a separate, inspectable step, never a silent rejection.",
  },
  {
    icon: Eye,
    title: "Transparent Eligibility",
    description: "A deterministic rule engine — never generative AI — decides formal eligibility, with every criterion shown to the applicant.",
  },
  {
    icon: LockKeyhole,
    title: "Secure & Traceable",
    description: "Role-based access, masked sensitive identifiers, and a full audit trail of every decision and correction.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-text">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Scholar Sarthi</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-text hover:bg-slate-100 sm:px-4">
              Log in
            </Link>
            <Link to="/register" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark sm:px-4">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <span className="mb-4 inline-block rounded-full border border-blue-200 bg-primary-light px-3 py-1 text-xs font-medium text-primary">
            SIH 2026 · PS 239 · Prototype
          </span>
          <p className="mb-2 text-sm font-medium text-text-secondary">Clearer scholarship applications. Smarter verification.</p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-text sm:text-5xl">
            Scholarship applications,
            <br />
            made clearer.
          </h1>
          <p className="mt-5 text-lg text-text-secondary">
            AI-assisted document verification, transparent eligibility checks, and clear guidance for applicants and
            administrators.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/schemes" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary-dark">
              Explore Schemes <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-5 py-3 text-sm font-medium text-text hover:bg-slate-50">
              Officer Login
            </Link>
          </div>
        </div>

        <div className="mt-16 rounded-2xl border border-border bg-slate-50 p-6 sm:p-10">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">How it works</p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {workflow.map((step, idx) => (
              <div key={step.label} className="flex items-center gap-3 sm:gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-full border border-border bg-white p-3 shadow-sm">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-text-secondary">{step.label}</span>
                </div>
                {idx < workflow.length - 1 && <ArrowRight className="h-4 w-4 text-slate-300" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-bg py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-2 text-2xl font-semibold text-text">Built on one principle</h2>
          <p className="mb-10 max-w-2xl text-text-secondary">
            <strong className="text-text">AI assists. Rules determine eligibility. Humans make the final decision.</strong> Every
            screen in this product says so explicitly — no automated approvals or rejections, anywhere.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((s) => (
              <div key={s.title} className="card p-6">
                <div className="mb-3 inline-flex rounded-lg bg-primary-light p-2.5 text-primary">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 font-semibold text-text">{s.title}</h3>
                <p className="text-sm text-text-secondary">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-text-secondary sm:px-6">
          Prototype built for Smart India Hackathon 2026 (PS 239). Schemes shown are demo data, not official government schemes.
        </div>
      </footer>
    </div>
  );
}
