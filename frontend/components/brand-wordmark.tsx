"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("font-bold text-2xl tracking-tight", className)} aria-label="CloudFlow+ home">
      <span className="text-primary">Cloud</span>
      <span className="text-foreground">Flow</span>
      <span className="text-primary">+</span>
    </Link>
  )
}

export function BrandIcon({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex h-8 w-8 items-center justify-center font-extrabold text-2xl", className)}
      aria-label="CloudFlow+ home"
    >
      <span className="text-primary">C</span>
      <span className="text-foreground">F</span>
      <span className="text-primary">+</span>
    </Link>
  )
}
