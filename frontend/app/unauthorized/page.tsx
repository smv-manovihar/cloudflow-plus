"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Lock, Home, LogIn } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md text-center space-y-8 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <div className="relative bg-primary/10 p-6 rounded-full">
              <Lock className="h-16 w-16 text-primary" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h1 className="text-4xl font-bold text-foreground">403</h1>
          <p className="text-xl font-semibold text-foreground">Access Denied</p>
          <p className="text-muted-foreground">
            You don't have permission to access this resource. Please log in or
            contact an administrator.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-4">
          <Link href="/login" className="w-full">
            <Button className="w-full gap-2 bg-primary hover:bg-primary/90">
              <LogIn className="h-4 w-4" />
              Sign In
            </Button>
          </Link>
          <Link href="/" className="w-full">
            <Button variant="outline" className="w-full gap-2 bg-transparent">
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        {/* Decorative elements */}
        <div className="pt-8 space-y-2 text-sm text-muted-foreground">
          <p>Error Code: 403</p>
          <p>Forbidden</p>
        </div>
      </div>
    </div>
  );
}
