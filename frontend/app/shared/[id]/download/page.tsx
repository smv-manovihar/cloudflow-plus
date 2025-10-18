"use client";

import { useState } from "react";
import { Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import Link from "next/link";

export default function PublicDownloadPage({
  params,
}: {
  params: { id: string };
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    // Simulate download
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsDownloading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500">
        {/* Header */}
        <div className="flex justify-center">
          <BrandWordmark />
        </div>

        {/* Content Card */}
        <div className="bg-card border border-border rounded-lg shadow-lg p-8 space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Download File
            </h1>
            <p className="text-sm text-muted-foreground">presentation.pdf</p>
          </div>

          <div className="bg-muted rounded-lg p-8 flex items-center justify-center">
            <div className="text-5xl">📄</div>
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-foreground">
              <span className="font-medium">File Size:</span> 2.5 MB
            </p>
            <p className="text-foreground">
              <span className="font-medium">Uploaded:</span> January 15, 2024
            </p>
          </div>

          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            size="lg"
            className="w-full"
          >
            {isDownloading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                Downloading...
              </div>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                Download File
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <div className="text-center space-y-4">
          <p className="text-xs text-muted-foreground">
            Powered by{" "}
            <span className="font-semibold text-foreground">CloudFlow+</span>
          </p>
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:bg-transparent"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to CloudFlow+
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
