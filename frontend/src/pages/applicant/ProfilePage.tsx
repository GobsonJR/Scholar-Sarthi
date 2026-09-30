import { useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../../components/ui/Button";

export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-text">Profile</h1>
      <div className="card p-6">
        <div className="mb-6 flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-2xl font-semibold text-primary">
            {user?.full_name?.charAt(0)}
          </span>
          <div>
            <p className="text-lg font-semibold text-text">{user?.full_name}</p>
            <p className="text-sm text-text-secondary">{user?.email}</p>
          </div>
        </div>
        <dl className="space-y-3 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Phone</dt>
            <dd className="font-medium text-text">{user?.phone ?? "Not provided"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Role</dt>
            <dd className="font-medium capitalize text-text">{user?.role}</dd>
          </div>
        </dl>
        <div className="mt-6 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-text-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          Sensitive identifiers on your documents (e.g. ID numbers) are masked wherever they aren't strictly required, to protect your privacy.
        </div>
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>
    </div>
  );
}
