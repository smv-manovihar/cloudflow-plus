"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { PanelLeftOpenIcon, PanelLeftCloseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth.context";
import { BreadcrumbNav } from "./breadcrumb-nav";

const publicRoutes = ["/login", "/signup"];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const isPublicSharedDownload =
      pathname.startsWith("/shared/") && pathname.endsWith("/download");
    if (
      !isAuthenticated &&
      !publicRoutes.includes(pathname) &&
      !isPublicSharedDownload
    ) {
      router.push("/login");
    }
  }, [isAuthenticated, authLoading, pathname, router]);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("sidebar-expanded");
    if (saved !== null) {
      setIsExpanded(JSON.parse(saved));
    }
  }, []);

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
  const isPublicSharedDownload =
    pathname.startsWith("/shared/") && pathname.endsWith("/download");

  if (isPublicRoute || isPublicSharedDownload) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return null;
  }

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
            <Button
              variant="ghost"
              size="icon"
              onClick={isMobile ? toggleMobileMenu : toggleExpanded}
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
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

            <div className="flex-1 min-w-0 overflow-hidden">
              <BreadcrumbNav />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
