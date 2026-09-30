import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GraduationCap, LogIn } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { apiErrorMessage } from "../services/api";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const user = await login(email, password);
      navigate(from ?? (user.role === "officer" ? "/officer/dashboard" : "/app/dashboard"));
    } catch (err) {
      setError(apiErrorMessage(err, "Invalid email or password."));
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (role: "applicant" | "officer") => {
    setEmail(role === "applicant" ? "applicant@demo.com" : "officer@demo.com");
    setPassword("Demo@123");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="mb-3 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            <span className="text-lg font-semibold text-text">Scholar Sarthi</span>
          </Link>
          <h1 className="text-xl font-semibold text-text">Welcome back</h1>
          <p className="mt-1 text-sm text-text-secondary">Log in to continue to your dashboard.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" isLoading={isLoading}>
            <LogIn className="h-4 w-4" /> Log in
          </Button>
        </form>

        <div className="mt-4 rounded-xl border border-dashed border-border bg-white p-4 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">Quick demo access</p>
          <div className="flex gap-2">
            <button onClick={() => fillDemo("applicant")} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-slate-50">
              Applicant Demo
            </button>
            <button onClick={() => fillDemo("officer")} className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-slate-50">
              Officer Demo
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-sm text-text-secondary">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Register as an applicant
          </Link>
        </p>
      </div>
    </div>
  );
}
