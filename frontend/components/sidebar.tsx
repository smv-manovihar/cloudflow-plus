"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { BrandWordmark } from "./brand-wordmark"

const NAV = [
  { href: "/", label: "Buckets" },
  { href: "/shared", label: "Shared" },
  { href: "/settings", label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex min-h-dvh flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="border-b p-4">
        <BrandWordmark />
      </div>
      <nav aria-label="Primary" className="p-2">
        <ul className="grid gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link href={item.href} className="block">
                  <Button
                    variant={active ? "default" : "ghost"}
                    className={cn("w-full justify-start", active && "bg-primary text-primary-foreground")}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Button>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="mt-auto grid gap-3 p-4">
        <ThemeToggle />
        <div aria-label="User profile" className="rounded-md border p-3">
          <div className="text-sm font-medium">Alex Johnson</div>
          <div className="text-xs text-muted-foreground">alex@company.com</div>
        </div>
      </div>
    </aside>
  )
}
