"use client";

import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useBreadcrumbs } from "@/contexts/breadcrumbs.context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMemo } from "react";
import { useMobile } from "@/hooks/use-mobile";

export function BreadcrumbNav() {
  const { breadcrumbs } = useBreadcrumbs();
  const router = useRouter();
  const isMobile = useMobile();

  const { visibleCrumbs, hiddenCrumbs } = useMemo(() => {
    if (!isMobile || breadcrumbs.length <= 1) {
      return { visibleCrumbs: breadcrumbs, hiddenCrumbs: [] };
    }
    // On mobile, show only the last crumb, hide all others (including Home) in dropdown
    return {
      visibleCrumbs: [breadcrumbs[breadcrumbs.length - 1]],
      hiddenCrumbs: breadcrumbs.slice(0, -1),
    };
  }, [breadcrumbs, isMobile]);

  const handleClick = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  if (!breadcrumbs.length) return null;

  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
      {visibleCrumbs.map((crumb, index) => {
        const isLast = index === visibleCrumbs.length - 1;

        return (
          <div
            key={crumb.href}
            className={cn(
              "flex items-center min-w-0",
              isLast && "flex-1",
              !isLast && "flex-shrink-0"
            )}
          >
            {/* Show ChevronRight for desktop (index > 0) or mobile (before dropdown or last crumb) */}

            {/* Show dropdown before the last crumb on mobile if there are hidden crumbs */}
            {isMobile && isLast && hiddenCrumbs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 flex items-center gap-1"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-[280px]">
                  {hiddenCrumbs.map((hidden) => (
                    <DropdownMenuItem
                      key={hidden.href}
                      onClick={(e) => handleClick(hidden.href, e)}
                      className="cursor-pointer"
                    >
                      <span className="truncate">{hidden.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {((!isMobile && index > 0) ||
              (isMobile && (hiddenCrumbs.length > 0 || !isLast))) && (
              <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-foreground" />
            )}

            <Button
              variant="link"
              size="sm"
              onClick={(e) => handleClick(crumb.href, e)}
              className={cn(
                "h-auto p-0 font-medium",
                isLast &&
                  "pointer-events-none text-foreground hover:no-underline",
                !isLast &&
                  "text-foreground hover:text-primary transition-colors duration-300"
              )}
              disabled={isLast}
            >
              <span
                className="truncate block max-w-[150px] md:max-w-[200px]"
                title={crumb.label}
              >
                {crumb.label}
              </span>
            </Button>
          </div>
        );
      })}
    </nav>
  );
}
