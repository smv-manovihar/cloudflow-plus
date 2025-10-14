"use client"

import * as React from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Copy, LinkIcon, QrCode } from "lucide-react"

export type ManageShareItem = {
  id: string
  name: string
  size: string
  createdAt: string
  expiresAt?: string | null
  views?: number
  url: string
}

export function ManageShareDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ManageShareItem | null
}) {
  const [duration, setDuration] = React.useState<string>("7d")
  const shareUrl = item?.url ?? ""

  React.useEffect(() => {
    if (!open || !item) return
    // If your API returns duration/expiry, hydrate it here
    // setDuration(item.duration ?? '7d')
  }, [open, item])

  function copyUrl() {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    toast({ title: "Link copied", description: "Share URL copied to clipboard." })
  }

  async function saveChanges() {
    // TODO: PATCH your API with the new duration/expiry
    toast({ title: "Share updated", description: "Share settings were saved." })
    onOpenChange(false)
  }

  if (!item) return null

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(shareUrl)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage shared link</DialogTitle>
          <DialogDescription>View details, set duration, and share the link or QR code.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* Link */}
          <div className="grid gap-2">
            <Label htmlFor="share-url">Share URL</Label>
            <div className="flex items-center gap-2">
              <Input id="share-url" value={shareUrl} readOnly />
              <Button variant="secondary" onClick={copyUrl} aria-label="Copy share URL">
                <Copy className="mr-2 size-4" />
                Copy
              </Button>
            </div>
          </div>

          {/* Details */}
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="whitespace-nowrap">
                {item.name}
              </Badge>
              <Badge variant="secondary" className="whitespace-nowrap">
                {item.size}
              </Badge>
              <Badge className="whitespace-nowrap">Views: {item.views ?? 0}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Created: {item.createdAt}</p>
              <p>Expires: {item.expiresAt ?? "Never"}</p>
            </div>
          </div>

          <Separator />

          {/* Duration */}
          <div className="grid gap-2">
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger aria-label="Expiration duration">
                <SelectValue placeholder="Choose a duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">1 minute</SelectItem>
                <SelectItem value="5m">5 minutes</SelectItem>
                <SelectItem value="15m">15 minutes</SelectItem>
                <SelectItem value="30m">30 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="6h">6 hours</SelectItem>
                <SelectItem value="12h">12 hours</SelectItem>
                <SelectItem value="1d">1 day</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="never">Never expire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* QR */}
          <div className="grid gap-2">
            <Label>QR code</Label>
            <div className="flex items-center gap-4">
              <Image
                src={qrSrc || null}
                alt="QR code for shared link"
                width={160}
                height={160}
                className="rounded-md border"
              />
              <div className="grid gap-2">
                <Button variant="outline" asChild>
                  <a href={shareUrl} target="_blank" rel="noreferrer">
                    <LinkIcon className="mr-2 size-4" />
                    Open link
                  </a>
                </Button>
                <Button variant="outline" onClick={() => window.open(qrSrc, "_blank")}>
                  <QrCode className="mr-2 size-4" />
                  Open QR
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={saveChanges}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
