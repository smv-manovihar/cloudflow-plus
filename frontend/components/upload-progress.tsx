"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SSEProgress = { percent?: number; transferred?: number; total?: number; state?: string }
type Props = {
  // client-side upload progress 0-100
  clientProgress?: number
  // event stream endpoint that emits JSON lines with { percent }
  sseUrl?: string | null
  title?: string
}

export function UploadProgress({ clientProgress = 0, sseUrl, title = "Uploading" }: Props) {
  const [cloudPct, setCloudPct] = useState<number>(0)

  useEffect(() => {
    if (!sseUrl) return
    const es = new EventSource(sseUrl, { withCredentials: false })
    es.onmessage = (e) => {
      try {
        const data: SSEProgress = JSON.parse(e.data)
        if (typeof data.percent === "number") {
          setCloudPct(Math.max(0, Math.min(100, data.percent)))
        }
      } catch {
        // ignore bad frames
      }
    }
    es.onerror = () => {
      es.close()
    }
    return () => es.close()
  }, [sseUrl])

  return (
    <Card aria-live="polite">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Sending to CloudFlow</span>
            <span className="tabular-nums">{Math.round(clientProgress)}%</span>
          </div>
          <Progress value={clientProgress} aria-label="Client upload progress" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Syncing to storage</span>
            <span className="tabular-nums">{Math.round(cloudPct)}%</span>
          </div>
          <Progress value={cloudPct} aria-label="Cloud storage progress" />
        </div>
      </CardContent>
    </Card>
  )
}
