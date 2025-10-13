"use client"

import type React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Folder } from "lucide-react"
import { useCallback } from "react"

export type BucketItem = {
  id: string
  name: string
  objects: number
  updatedAt: string
}

export function BucketsView({
  items,
  view,
  onOpen,
}: {
  items: BucketItem[]
  view: "list" | "grid"
  onOpen: (bucket: BucketItem) => void
}) {
  const onKey = useCallback(
    (e: React.KeyboardEvent, item: BucketItem) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onOpen(item)
      }
    },
    [onOpen],
  )

  if (view === "grid") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((b) => (
          <Card
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(b)}
            onKeyDown={(e) => onKey(e, b)}
            className="transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Open bucket ${b.name}`}
          >
            <CardHeader className="flex-row items-center gap-3">
              <Folder className="size-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="truncate">{b.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>
                  {b.objects} {b.objects === 1 ? "object" : "objects"}
                </span>
                <span>Updated {b.updatedAt}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-md border">
      <div className="grid grid-cols-[minmax(0,1fr)_140px_180px_100px] items-center border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <div>Name</div>
        <div className="hidden md:block">Objects</div>
        <div className="hidden md:block">Last modified</div>
        <div className="text-right">Open</div>
      </div>
      <ul className="divide-y">
        {items.map((b) => (
          <li key={b.id} className="grid grid-cols-[minmax(0,1fr)_140px_180px_100px] items-center px-3 py-3">
            <div className="min-w-0 flex items-center gap-2">
              <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{b.name}</span>
            </div>
            <div className="hidden md:block text-sm text-muted-foreground">{b.objects}</div>
            <div className="hidden md:block text-sm text-muted-foreground">{b.updatedAt}</div>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={() => onOpen(b)} aria-label={`Open ${b.name}`}>
                Open
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
