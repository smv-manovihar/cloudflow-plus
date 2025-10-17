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
  const [delayedCollapsed, setDelayedCollapsed] = useState(collapsed);
  const [opacityClass, setOpacityClass] = useState("opacity-100");
  const [buttonOpacityClass, setButtonOpacityClass] = useState("opacity-100");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (collapsed) {
      // Instant collapse: full opacity for button
      setDelayedCollapsed(true);
      setButtonOpacityClass("opacity-100");
      setOpacityClass("opacity-100");
    } else {
      // Delayed expand: fade out button, then fade in expanded view
      setButtonOpacityClass("opacity-0");
      const timer = setTimeout(() => {
        setDelayedCollapsed(false);
        setOpacityClass("opacity-0");
        // Trigger fade-in after render
        setTimeout(() => setOpacityClass("opacity-100"), 10);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [collapsed]);

  const toggleTheme = () => {
    setTimeout(() => {
      setTheme(resolvedTheme === "light" ? "dark" : "light");
    }, 200);
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        aria-label="Toggle theme"
        disabled
      />
    );
  }

  if (delayedCollapsed) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className={cn(
          "h-8 w-8 transition-opacity duration-300",
          buttonOpacityClass,
          className
        )}
        aria-label="Toggle theme"
      >
        {resolvedTheme === "light" ? (
          <Sun className="h-4 w-4 transition-all duration-300" />
        ) : (
          <Moon className="h-4 w-4 transition-all duration-300" />
        )}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] transition-opacity duration-300 ease-in-out bg-secondary rounded-md p-3 w-full",
        opacityClass,
        className
      )}
    >
      <span className="truncate text-sm">Theme</span>
      <div className="flex items-center space-x-1">
        <Sun
          className={`h-[1.2rem] w-[1.2rem] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            resolvedTheme === "dark"
              ? "text-[#A1A1AA] scale-75 rotate-12"
              : "text-foreground scale-100 rotate-0"
          }`}
        />
        <Switch
          checked={resolvedTheme === "dark"}
          onCheckedChange={toggleTheme}
          aria-label="Toggle theme"
          className="transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110"
        />
        <Moon
          className={`h-[1.2rem] w-[1.2rem] transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            resolvedTheme === "light"
              ? "text-[#A1A1AA] scale-75 rotate-12"
              : "text-foreground scale-100 rotate-0"
          }`}
        />
      </div>
    </div>
  );
}
