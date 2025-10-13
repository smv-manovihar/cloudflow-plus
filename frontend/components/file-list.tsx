"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Download, Share2, Trash2, Folder, FileText } from "lucide-react"

export type FileItem = {
  id: string
  name: string
  type: "file" | "folder"
  size: string
  updatedAt: string
}

export function FileList({
  items,
  onShare,
  onDownload,
  onDelete,
}: {
  items: FileItem[]
  onShare: (item: FileItem) => void
  onDownload: (item: FileItem) => void
  onDelete: (item: FileItem) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="w-full overflow-hidden rounded-md border">
      <div className="grid grid-cols-[minmax(0,1fr)_160px_120px_160px] items-center border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <div>Name</div>
        <div className="hidden md:block">Last modified</div>
        <div className="hidden md:block">Size</div>
        <div className="text-right">Actions</div>
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const isHover = hovered === item.id
          return (
            <li
              key={item.id}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              className="grid grid-cols-[minmax(0,1fr)_160px_120px_160px] items-center px-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                {item.type === "folder" ? (
                  <Folder className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="truncate">{item.name}</span>
              </div>
              <div className="hidden md:block text-sm text-muted-foreground">{item.updatedAt}</div>
              <div className="hidden md:block text-sm text-muted-foreground">{item.size}</div>
              <div className="flex justify-end">
                <div className={cn("flex items-center gap-1 opacity-0 transition-opacity", isHover && "opacity-100")}>
                  <Button size="icon" variant="ghost" aria-label={`Share ${item.name}`} onClick={() => onShare(item)}>
                    <Share2 className="size-4" />
                  </Button>
                  {item.type === "file" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Download ${item.name}`}
                      onClick={() => onDownload(item)}
                    >
                      <Download className="size-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
