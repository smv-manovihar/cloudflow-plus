import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BreadcrumbsProps {
  prefix: string;
  router: ReturnType<typeof useRouter>;
}

export default function Breadcrumbs({ prefix, router }: BreadcrumbsProps) {
  const breadcrumbParts = prefix ? prefix.split("/").filter(Boolean) : [];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Button
        variant="link"
        size="sm"
        onClick={() => router.push("/")}
        className={cn(
          "p-0 h-auto",
          !prefix && "text-foreground font-medium pointer-events-none"
        )}
      >
        Home
      </Button>
      {breadcrumbParts.map((part, index) => (
        <div key={index} className="flex items-center gap-2">
          <span>/</span>
          {index === breadcrumbParts.length - 1 ? (
            <span className="text-foreground font-medium">{part}</span>
          ) : (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                const newPrefix =
                  breadcrumbParts.slice(0, index + 1).join("/") + "/";
                router.push(`/?prefix=${encodeURIComponent(newPrefix)}`);
              }}
              className="p-0 h-auto"
            >
              {part}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
