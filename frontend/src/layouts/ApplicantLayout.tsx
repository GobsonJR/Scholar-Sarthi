import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  FileStack,
  FolderOpen,
  Bell,
  HelpCircle,
  User,
  LogOut,
  Menu,
  X,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "../services/notifications";
import { cn } from "../utils/cn";

const navItems = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/schemes", label: "Discover Schemes", icon: Search },
  { to: "/app/applications", label: "My Applications", icon: FolderOpen },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/assistant", label: "Help & AI Assistant", icon: HelpCircle },
  { to: "/app/profile", label: "Profile", icon: User },
];

const mobileNavItems = [
  { to: "/app/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/app/schemes", label: "Discover", icon: Search },
  { to: "/app/applications", label: "Applications", icon: FileStack },
  { to: "/app/notifications", label: "Alerts", icon: Bell },
  { to: "/app/profile", label: "Profile", icon: User },
];

export function ApplicantLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: notifications } = useQuery({ queryKey: ["notifications"], queryFn: listNotifications, refetchInterval: 30000 });
  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-white lg:flex">
        <div className="flex items-center gap-2 px-6 py-5">
          <GraduationCap className="h-6 w-6 text-blue-300" />
          <span className="font-semibold">Scholar Sarthi</span>
          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">SIH DEMO</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-slate-300 hover:bg-sidebar-hover hover:text-white",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-xs">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-sidebar-hover hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-sidebar text-white">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-blue-300" />
                <span className="font-semibold">Scholar Sarthi</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-3 hover:bg-sidebar-hover" aria-label="Close navigation menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
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
              <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-sidebar-hover hover:text-white">
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-3 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <span className="font-semibold text-text">Scholar Sarthi</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NavLink to="/app/notifications" className="relative rounded-lg p-3 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="h-5 w-5 text-text-secondary" />
              {unreadCount > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
            </NavLink>
            <NavLink to="/app/profile" className="flex items-center gap-2" aria-label="Profile">
              <span className="hidden text-sm font-medium text-text sm:block">{user?.full_name}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light text-sm font-semibold text-primary">
                {user?.full_name?.charAt(0)}
              </span>
            </NavLink>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 pb-24 pt-5 sm:px-6 lg:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-border bg-white lg:hidden">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px]", isActive ? "text-primary" : "text-text-secondary")
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
