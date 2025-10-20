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
import { useMemo, useEffect, useState, useRef } from "react";
import { useMobile } from "@/hooks/use-mobile";

export function BreadcrumbNav() {
  const { breadcrumbs } = useBreadcrumbs();
  const router = useRouter();
  const isMobile = useMobile();
  const containerRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const { visibleCrumbs, hiddenCrumbs } = useMemo(() => {
    if (isMobile) {
      if (breadcrumbs.length <= 1) {
        return { visibleCrumbs: breadcrumbs, hiddenCrumbs: [] };
      }
      return {
        visibleCrumbs: [breadcrumbs[breadcrumbs.length - 1]],
        hiddenCrumbs: breadcrumbs.slice(0, -1),
      };
    }

    if (containerWidth > 0 && breadcrumbs.length > 1) {
      const estimatedWidth = breadcrumbs.reduce(
        (sum, crumb) => sum + Math.min(crumb.label.length * 8, 200) + 24,
        0
      );

      const shouldCollapse = estimatedWidth > containerWidth * 0.8;

      if (shouldCollapse && breadcrumbs.length > 2) {
        return {
          visibleCrumbs: [breadcrumbs[breadcrumbs.length - 1]],
          hiddenCrumbs: breadcrumbs.slice(0, -1),
        };
      }
    }

    return { visibleCrumbs: breadcrumbs, hiddenCrumbs: [] };
  }, [breadcrumbs, isMobile, containerWidth]);

  const handleClick = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  if (!breadcrumbs.length) return null;

  return (
    <nav
      ref={containerRef}
      className="flex items-center space-x-1 text-xs md:text-sm text-muted-foreground overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500"
    >
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
            {/* Show dropdown for hidden breadcrumbs when collapsed */}
            {isLast && hiddenCrumbs.length > 0 && (
              <>
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
                  <DropdownMenuContent align="start">
                    {hiddenCrumbs.map((hidden) => (
                      <DropdownMenuItem
                        key={hidden.href}
                        onClick={(e) => handleClick(hidden.href, e)}
                        className="cursor-pointer"
                      >
                        <span className="truncate max-w-[280px]">
                          {hidden.label}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Chevron after dropdown, before current item */}
                <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-foreground" />
              </>
            )}

            {/* Show chevron before all items except the first when not collapsed */}
            {hiddenCrumbs.length === 0 && index > 0 && (
              <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0 text-foreground" />
            )}

            <Button
              variant="link"
              size="sm"
              onClick={(e) => handleClick(crumb.href, e)}
              className={cn(
                "h-auto p-0",
                isLast
                  ? "pointer-events-none text-foreground hover:no-underline font-semibold"
                  : "text-foreground hover:text-primary transition-colors duration-300"
              )}
              disabled={isLast}
            >
              <span
                className="truncate block text-xs md:text-sm"
                style={{
                  maxWidth: isMobile ? "120px" : "clamp(80px, 15vw, 300px)",
                }}
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
