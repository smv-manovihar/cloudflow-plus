"use client"

import type React from "react"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { UploadCloud } from "lucide-react"

export function UploadDropzone({
  onFiles,
  className,
}: {
  onFiles: (files: File[]) => void
  className?: string
}) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const openPicker = useCallback(() => inputRef.current?.click(), [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDrag(false)
      const files = Array.from(e.dataTransfer.files || [])
      if (files.length) onFiles(files)
    },
    [onFiles],
  )

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : []
      if (files.length) onFiles(files)
    },
    [onFiles],
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
      onDragEnter={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDrag(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDrag(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDrag(false)
      }}
      onDrop={onDrop}
      aria-label="Upload files by dragging and dropping or clicking to choose files"
      className={cn(
        "rounded-md border border-dashed p-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        drag ? "bg-muted" : "bg-transparent",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="mx-auto grid max-w-md place-items-center gap-2">
        <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-medium">Drag & drop files</span> or click to browse
        </p>
        <p className="text-xs text-muted-foreground">Max 2GB per file</p>
      </div>
    </div>
  )
}
