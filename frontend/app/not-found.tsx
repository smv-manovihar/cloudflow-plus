"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative bg-primary/10 p-6 rounded-full">
              <FileQuestion className="h-16 w-16 text-primary" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-foreground">404</h1>
          <p className="text-xl font-semibold text-foreground">
            Page Not Found
          </p>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved. Let's
            get you back on track.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          <Link href="/" className="w-full">
            <Button className="w-full gap-2 bg-primary hover:bg-primary/90">
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full gap-2 bg-transparent"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </div>

        {/* Decorative elements */}
        <div className="pt-8 space-y-2 text-sm text-muted-foreground">
          <p>Error Code: 404</p>
          <p>Resource Not Found</p>
        </div>
      </div>
    </div>
  );
}
