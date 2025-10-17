"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Menu,
  X,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  PanelLeftOpenIcon,
  PanelLeftCloseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const publicRoutes = ["/login", "/signup"];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const auth = localStorage.getItem("auth");
    const isAuth = auth ? JSON.parse(auth).authenticated : false;
    setIsAuthenticated(isAuth);

    if (!isAuth && !publicRoutes.includes(pathname)) {
      router.push("/login");
    }

    // Load sidebar state from localStorage
    const saved = localStorage.getItem("sidebar-expanded");
    if (saved !== null) {
      setIsExpanded(JSON.parse(saved));
    }
  }, [pathname, router]);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileOpen(false);
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem("sidebar-expanded", JSON.stringify(newState));
  };

  const toggleMobileMenu = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileOpen(false);
  };

  if (!mounted) return null;

  const isPublicRoute = publicRoutes.includes(pathname);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

  const getBreadcrumbs = () => {
    const prefix = searchParams.get("prefix") || "";
    const breadcrumbs = [];

    // Add Home
    breadcrumbs.push({ label: "Home", href: "/" });

    // Add folder path from prefix
    if (prefix) {
      const parts = prefix.split("/").filter(Boolean);
      let currentPath = "";
      parts.forEach((part, index) => {
        currentPath += part + "/";
        breadcrumbs.push({
          label: part,
          href: `/?prefix=${encodeURIComponent(currentPath)}`,
        });
      });
    }

    // Add page-specific breadcrumbs
    if (pathname === "/shared") {
      breadcrumbs.push({ label: "Shared Links", href: "/shared" });
    } else if (pathname === "/settings") {
      breadcrumbs.push({ label: "Settings", href: "/settings" });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        isExpanded={isExpanded}
        isMobile={isMobile}
        isMobileOpen={isMobileOpen}
        onCloseMobile={closeMobileMenu}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-4 md:px-3 py-3 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-4">
            {/* Toggle button - mobile or desktop */}
            <Button
              variant="ghost"
              size="icon"
              onClick={isMobile ? toggleMobileMenu : toggleExpanded}
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label={isMobile ? "Toggle menu" : "Toggle sidebar"}
            >
              {isMobile ? (
                isMobileOpen ? (
                  <PanelLeftCloseIcon className="h-5 w-5" />
                ) : (
                  <PanelLeftOpenIcon className="h-5 w-5" />
                )
              ) : isExpanded ? (
                <PanelLeftCloseIcon className="h-5 w-5" />
              ) : (
                <PanelLeftOpenIcon className="h-5 w-5" />
              )}
            </Button>

            {/* Breadcrumbs */}
            <div className="flex-1 flex items-center gap-1 text-sm flex-wrap">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center gap-1">
                  {index > 0 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => router.push(crumb.href)}
                    disabled={index === breadcrumbs.length - 1}
                    className={cn(
                      "h-auto p-0 font-medium",
                      "disabled:text-foreground disabled:opacity-100 disabled:no-underline"
                    )}
                  >
                    {crumb.label}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
