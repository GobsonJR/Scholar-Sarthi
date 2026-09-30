import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  ShieldAlert,
  GraduationCap as SchemeIcon,
  BarChart3,
  ScrollText,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../utils/cn";

const navItems = [
  { to: "/officer/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/officer/applications", label: "Applications", icon: FolderKanban },
  { to: "/officer/flagged", label: "Flagged Applications", icon: ShieldAlert },
  { to: "/officer/schemes", label: "Schemes", icon: SchemeIcon },
  { to: "/officer/reports", label: "Reports", icon: BarChart3 },
  { to: "/officer/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export function OfficerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <div className="flex items-center gap-2 px-6 py-5">
        <ShieldCheck className="h-6 w-6 text-blue-300" />
        <span className="font-semibold">Officer Console</span>
        <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">SIH DEMO</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive ? "bg-primary text-white" : "text-slate-300 hover:bg-sidebar-hover hover:text-white",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <p className="px-3 py-1 text-xs text-slate-400">{user?.full_name}</p>
        <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-sidebar-hover hover:text-white">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-white lg:flex">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-sidebar text-white">
            <div className="flex justify-end px-4 pt-4">
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-3 hover:bg-sidebar-hover" aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-3 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold text-text lg:hidden">Officer Console</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-text sm:block">{user?.full_name}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-light text-sm font-semibold text-secondary">
              {user?.full_name?.charAt(0)}
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-10 pt-5 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
