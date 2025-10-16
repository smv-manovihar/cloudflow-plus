"use client"

import { X, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ToastMessage } from "@/components/toast-provider"

interface ToastProps {
  toast: ToastMessage
  onClose: () => void
}

export function Toast({ toast, onClose }: ToastProps) {
  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
      case "error":
        return <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
      case "loading":
      case "progress":
        return <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
      default:
        return null
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300 pointer-events-auto max-w-sm">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{toast.message}</p>
        {toast.type === "progress" && toast.progress !== undefined && (
          <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${toast.progress}%` }} />
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} className="h-5 w-5 p-0 flex-shrink-0 hover:bg-muted">
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
