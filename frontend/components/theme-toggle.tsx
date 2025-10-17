"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
  className?: string;
}

export function ThemeToggle({
  collapsed = false,
  className,
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  };

  if (!mounted) {
    return (
      <div
        className={cn(
          "transition-all duration-300 ease-in-out",
          collapsed ? "w-8" : "w-full",
          className
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Toggle theme"
          disabled
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        collapsed ? "w-8" : "w-full",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center transition-all duration-300 ease-in-out",
          collapsed
            ? "justify-center w-8 p-2"
            : "justify-between bg-secondary rounded-md p-3 w-full"
        )}
      >
        {collapsed ? (
          <Button
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 shrink-0 bg-transparent"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "light" ? (
              <Sun className="h-4 w-4 text-black" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <>
            <span className="truncate text-sm whitespace-nowrap">Theme</span>
            <div className="flex items-center space-x-1 shrink-0">
              <Sun
                className={cn(
                  "h-[1.2rem] w-[1.2rem] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  resolvedTheme === "dark"
                    ? "text-[#A1A1AA] scale-75 rotate-12"
                    : "text-foreground scale-100 rotate-0"
                )}
              />
              <Switch
                checked={resolvedTheme === "dark"}
                onCheckedChange={toggleTheme}
                aria-label="Toggle theme"
                className="transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110"
              />
              <Moon
                className={cn(
                  "h-[1.2rem] w-[1.2rem] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                  resolvedTheme === "light"
                    ? "text-[#A1A1AA] scale-75 rotate-12"
                    : "text-foreground scale-100 rotate-0"
                )}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
