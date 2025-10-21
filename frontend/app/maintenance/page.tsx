"use client";

import { Button } from "@/components/ui/button";
import { Wrench, Home } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative bg-primary/10 p-6 rounded-full">
              <Wrench className="h-16 w-16 text-primary" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-foreground">Maintenance</h1>
          <p className="text-xl font-semibold text-foreground">
            We'll be back soon
          </p>
          <p className="text-muted-foreground">
            We're currently performing scheduled maintenance to improve your
            experience. We'll be back online shortly.
          </p>
        </div>

        {/* Status */}
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            Expected downtime: Less than 1 hour
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          <Button
            variant="outline"
            className="w-full gap-2 bg-transparent"
            asChild
          >
            <a href="/">
              <Home className="h-4 w-4" />
              Back to Home
            </a>
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="pt-8 space-y-2 text-sm text-muted-foreground">
          <p>Status: Maintenance Mode</p>
          <p>Check back soon</p>
        </div>
      </div>
    </div>
  );
}
