"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Error caught:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-destructive/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative bg-destructive/10 p-6 rounded-full">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-foreground">Oops!</h1>
          <p className="text-xl font-semibold text-foreground">Something went wrong</p>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Please try again or contact support if the problem persists.
          </p>
        </div>

        {/* Error details */}
        {error.message && (
          <div className="bg-muted/50 border border-border rounded-lg p-4 text-left">
            <p className="text-xs font-mono text-muted-foreground break-words">{error.message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={reset} className="w-full gap-2 bg-primary hover:bg-primary/90">
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>
          <Button variant="outline" className="w-full gap-2 bg-transparent" asChild>
            <a href="/">
              <Home className="h-4 w-4" />
              Back to Home
            </a>
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="pt-8 space-y-2 text-sm text-muted-foreground">
          <p>Error Code: 500</p>
          <p>Internal Server Error</p>
        </div>
      </div>
    </div>
  )
}
