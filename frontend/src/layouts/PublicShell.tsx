import { Link, Outlet } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function PublicShell() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold text-text">Scholar Sarthi</span>
          </Link>
          {user ? (
            <Link
              to={user.role === "officer" ? "/officer/dashboard" : "/app/dashboard"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Go to Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-text hover:bg-slate-100 sm:px-4">
                Log in
              </Link>
              <Link to="/register" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-dark sm:px-4">
                Get Started
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl overflow-x-hidden px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
