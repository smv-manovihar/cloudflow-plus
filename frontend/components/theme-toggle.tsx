"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const isDarkMode = document.documentElement.classList.contains("dark")
    setIsDark(isDarkMode)
  }, [])

  const toggleTheme = () => {
    const html = document.documentElement
    if (isDark) {
      html.classList.remove("dark")
      setIsDark(false)
    } else {
      html.classList.add("dark")
      setIsDark(true)
    }
  }

  if (!mounted) return null

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="transition-transform duration-300"
    >
      {isDark ? (
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all duration-300" />
      ) : (
        <Moon className="h-5 w-5 rotate-0 scale-100 transition-all duration-300" />
      )}
    </Button>
  )
}
