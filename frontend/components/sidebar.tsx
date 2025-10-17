"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Home, Share2, Settings, LogOut, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandIcon, BrandWordmark } from "@/components/brand-wordmark";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shared", label: "Shared", icon: Share2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  isExpanded: boolean;
  isMobile: boolean;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  isExpanded,
  isMobile,
  isMobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState("John Doe");
  const [userEmail, setUserEmail] = useState("john@example.com");

  // Load user info from localStorage
  useEffect(() => {
    const auth = localStorage.getItem("auth");
    if (auth) {
      const authData = JSON.parse(auth);
      setUserName(authData.name || "John Doe");
      setUserEmail(authData.email || "john@example.com");
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth");
    router.push("/login");
  };

  if (isMobile) {
    return (
      <>
        {isMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30"
            onClick={onCloseMobile}
            aria-label="Close menu"
          />
        )}

        <nav
          className={cn(
            "fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border z-40 flex flex-col transition-transform duration-300",
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
            <BrandWordmark className="text-sidebar-foreground" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onCloseMobile}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="border-t border-sidebar-border p-4 space-y-3">
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-sidebar-accent/50">
              <User className="h-4 w-4 text-sidebar-foreground flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-sidebar-foreground truncate">
                  {userName}
                </p>
                <p className="text-xs text-sidebar-foreground/70 truncate">
                  {userEmail}
                </p>
              </div>
            </div>
            <ThemeToggle className="w-full justify-center" />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start gap-3 text-destructive hover:!bg-destructive hover:!text-destructive-foreground transition-colors duration-200"
            >
              <LogOut className="h-4 w-4 transition-colors duration-200" />
              <span className="text-sm">Logout</span>
            </Button>
          </div>
        </nav>
      </>
    );
  }

  // Desktop sidebar
  return (
    <nav
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 overflow-hidden",
        isExpanded ? "w-64" : "w-20"
      )}
    >
      <div className="p-4 border-b border-sidebar-border flex justify-center">
        {isExpanded ? <BrandWordmark /> : <BrandIcon />}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <div
              key={item.href}
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out",
                isExpanded ? "w-full" : "w-full"
              )}
            >
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-2 py-2 rounded-full transition-all duration-300 ease-in-out",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                title={!isExpanded ? item.label : undefined}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0")} />
                {isExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "border-t border-sidebar-border px-4 py-3 space-y-3 mb-8",
          !isExpanded && "flex flex-col items-center"
        )}
      >
        <div
          className={cn("flex justify-center", isExpanded ? "w-full" : "w-8")}
        >
          <ThemeToggle collapsed={!isExpanded} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-in-out cursor-pointer",
                isExpanded ? "w-full" : "w-8"
              )}
            >
              <div
                className={cn(
                  "flex items-center transition-all duration-300 ease-in-out",
                  isExpanded
                    ? "gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 w-full"
                    : "justify-center w-8 h-8 rounded-lg hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                )}
              >
                <User className="h-4 w-4 text-sidebar-foreground flex-shrink-0" />
                {isExpanded && (
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-semibold text-sidebar-foreground truncate">
                      {userName}
                    </p>
                    <p className="text-xs text-sidebar-foreground/70 truncate">
                      {userEmail}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" className="w-48">
            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center text-destructive hover:!bg-destructive hover:!text-destructive-foreground transition-colors duration-200"
            >
              <LogOut className="h-4 w-4 mr-2 transition-colors duration-200" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
