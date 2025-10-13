"use client"

import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function PublicLinkPage() {
  const params = useParams<{ id: string }>()
  const linkId = params.id

  // Placeholder file info; in real app fetch by linkId
  const file = {
    name: "q3-summary.pdf",
    size: "2.1 MB",
    bucket: "marketing",
    updatedAt: "2025-09-05",
    downloadUrl: `/api/link/${linkId}/download`,
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-2xl items-center gap-8 p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-pretty text-xl">Download {file.name}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="text-sm text-muted-foreground">
            <p>Size: {file.size}</p>
            <p>Updated: {file.updatedAt}</p>
            <p>From: {file.bucket}</p>
          </div>
          <Button asChild className="w-full">
            <a href={file.downloadUrl}>Download</a>
          </Button>
        </CardContent>
      </Card>

      <section aria-label="CloudFlow promo" className="text-center text-sm text-muted-foreground">
        <p>
          Shared with <span className="font-medium text-foreground">CloudFlow+</span>. Seamless storage, sharing, and
          collaboration.
        </p>
        <p>
          <a href="/" className="text-primary underline underline-offset-4">
            Join CloudFlow+
          </a>{" "}
          to create your own share links.
        </p>
      </section>
    </main>
  )
}
