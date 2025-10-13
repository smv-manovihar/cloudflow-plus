"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"

export default function PublicDownloadPage({
  params,
}: {
  params: { id: string }
}) {
  const mockFile = useMemo(() => {
    // Demo-only metadata
    return {
      name: "Shared-Report.pdf",
      size: "3.4 MB",
      id: params.id,
    }
  }, [params.id])

  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-2">
          <Logo />
          <CardTitle className="text-xl">Download File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div className="space-y-1">
            <p className="font-medium">{mockFile.name}</p>
            <p className="text-sm text-muted-foreground">Size: {mockFile.size}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => {
              console.log("[v0] Public download for id:", mockFile.id)
            }}
          >
            Download
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
