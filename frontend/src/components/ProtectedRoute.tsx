import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types";
import { LoadingState } from "./ui/States";

export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading your session..." />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === "officer" ? "/officer/dashboard" : "/app/dashboard"} replace />;
  }
  return <>{children}</>;
}
