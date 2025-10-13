"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

type Crumb = { label: string; href?: string }

export function Breadcrumbs({ items }: { items?: Crumb[] }) {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  const autoItems: Crumb[] = [
    { label: "Home", href: "/" },
    ...segments.map((seg, idx) => {
      const href = "/" + segments.slice(0, idx + 1).join("/")
      return { label: decodeURIComponent(seg), href: idx === segments.length - 1 ? undefined : href }
    }),
  ]

  const crumbs = items?.length ? items : autoItems

  return (
    <nav aria-label="Breadcrumbs" className="text-sm text-muted-foreground">
      <ol className="flex items-center gap-2">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={i} className={cn(!isLast && "hover:text-foreground transition-colors")}>
              {c.href && !isLast ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="mx-2">
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
