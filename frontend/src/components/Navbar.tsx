"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Mic, LayoutDashboard, Brain, TrendingUp, Settings, LogOut, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();

  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me().then((r) => r.data),
    retry: false,
  });

  const logout = () => {
    localStorage.removeItem("inflection_token");
    router.push("/");
  };

  const navLinks = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/memory", icon: Brain, label: "Memory" },
    { href: "/profile", icon: TrendingUp, label: "EQ Profile" },
    { href: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
            <Mic size={16} className="text-primary-light" />
          </div>
          <span className="text-base font-semibold gradient-text">Inflection</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-primary/15 text-primary-light"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <User size={14} className="text-primary-light" />
              </div>
              <span className="hidden sm:block">{user.name}</span>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary text-sm px-2 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
            <span className="hidden sm:block">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
