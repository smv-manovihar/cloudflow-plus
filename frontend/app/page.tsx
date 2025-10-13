"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { BucketsView, type BucketItem } from "@/components/buckets-view"
import { LayoutList, Grid3x3, Plus } from "lucide-react"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { CreateBucketDialog } from "@/components/create-bucket-dialog"

export default function BucketsPage() {
  const router = useRouter()
  const [view, setView] = useState<"list" | "grid">("list")
  const [query, setQuery] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [buckets] = useState<BucketItem[]>([
    { id: "marketing", name: "marketing", objects: 182, updatedAt: "2025-09-10" },
    { id: "backups", name: "backups", objects: 42, updatedAt: "2025-09-08" },
    { id: "designs", name: "designs", objects: 563, updatedAt: "2025-08-29" },
    { id: "invoices", name: "invoices", objects: 27, updatedAt: "2025-08-18" },
  ])

  const filtered = useMemo(
    () => (query ? buckets.filter((b) => b.name.toLowerCase().includes(query.toLowerCase())) : buckets),
    [buckets, query],
  )

  return (
    <div className="min-h-dvh grid md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="p-4 md:p-6">
        <header className="mb-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Buckets" }]} />

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <h1 className="text-balance text-2xl font-semibold tracking-tight">Buckets</h1>
              <div className="md:ml-2">
                <label htmlFor="search" className="sr-only">
                  Search buckets
                </label>
                <Input
                  id="search"
                  placeholder="Search buckets"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full sm:w-[260px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch md:self-auto">
              <Button variant="secondary" aria-label="Create bucket" onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 size-4" />
                Create Bucket
              </Button>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v as "list" | "grid")}
                aria-label="Choose buckets view"
              >
                <ToggleGroupItem value="list" aria-label="List view" className="data-[state=on]:bg-muted">
                  <LayoutList className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="grid" aria-label="Grid view" className="data-[state=on]:bg-muted">
                  <Grid3x3 className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </header>

        <section aria-label="Buckets browser">
          <BucketsView
            items={filtered}
            view={view}
            onOpen={(b) => router.push(`/buckets/${encodeURIComponent(b.id)}`)}
          />
        </section>

        <CreateBucketDialog open={showCreate} onOpenChange={setShowCreate} />
      </main>
    </div>
  )
}
