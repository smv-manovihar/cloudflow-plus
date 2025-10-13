"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

type Mode = "light" | "dark"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-12 w-full" aria-hidden />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <div className="grid gap-2">
      <span className="text-xs text-muted-foreground">Appearance</span>
      <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
        <div className="flex items-center gap-2 text-sm">
          <Sun aria-hidden className="size-4 opacity-70" />
          <Label htmlFor="theme-switch" className="cursor-pointer">
            Dark mode
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="theme-switch"
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? ("dark" as Mode) : ("light" as Mode))}
            aria-label="Toggle dark mode"
          />
          <Moon aria-hidden className="size-4 opacity-70" />
        </div>
      </div>
    </div>
  )
}
