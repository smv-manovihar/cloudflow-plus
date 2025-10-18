"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Copy, Download, QrCode, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SharedLinkDetails {
  id: string;
  name: string;
  fileSize: number;
  objectKey: string;
  bucket: string;
  link: string;
  status: "active" | "expired";
  expiresAt: string;
  createdAt: string;
  downloads: number;
  password?: string;
  isPasswordProtected: boolean;
}

export default function SharedLinkViewPage() {
  const router = useRouter();
  const params = useParams();

  const [isEnabled, setIsEnabled] = useState(true);
  const [password, setPassword] = useState("");
  const [expiryDate, setExpiryDate] = useState("2024-02-15");
  const [expiryTime, setExpiryTime] = useState("23:59");
  const [showPassword, setShowPassword] = useState(false);

  // Mock data - in real app, fetch based on params.id
  const link: SharedLinkDetails = {
    id: params.id as string,
    name: "presentation.pdf",
    fileSize: 2.5,
    objectKey: "files/presentations/presentation.pdf",
    bucket: "cloudflow-storage",
    link: "https://cloudflow.app/shared/abc123",
    status: "active",
    expiresAt: "2024-02-15",
    createdAt: "2024-01-15",
    downloads: 5,
    isPasswordProtected: false,
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(link.link);
    toast.success("Link copied to clipboard", { duration: 2000 });
  };

  const handleDownloadQR = () => {
    toast.success("QR code downloaded", { duration: 2000 });
  };

  const handleSaveChanges = () => {
    toast.success("Changes saved successfully", { duration: 2000 });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card p-1 md:p-2animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-3 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="transition-all hover:scale-110"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground">
              {link.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage share settings
            </p>
          </div>
        </div>
      </div>

      {/* Content - Three Column Layout */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Section - File Info */}
            <Card className="p-6 animate-in fade-in slide-in-from-left-2 duration-500">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                File Information
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    File Name
                  </p>
                  <p className="text-sm text-foreground break-words">
                    {link.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    File Size
                  </p>
                  <p className="text-sm text-foreground">{link.fileSize} MB</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Object Key
                  </p>
                  <p className="text-xs text-foreground break-all font-mono bg-muted p-2 rounded">
                    {link.objectKey}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Bucket
                  </p>
                  <p className="text-sm text-foreground">{link.bucket}</p>
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Created At
                  </p>
                  <p className="text-sm text-foreground">{link.createdAt}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Downloads
                  </p>
                  <p className="text-sm text-foreground">{link.downloads}</p>
                </div>
              </div>
            </Card>

            {/* Middle Section - Access Controls */}
            <Card className="p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                Access Controls
              </h2>
              <div className="space-y-4">
                {/* Enable/Disable Link */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    {isEnabled ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEnabled(!isEnabled)}
                    className={cn(
                      "transition-all",
                      isEnabled ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {isEnabled ? "Disable" : "Enable"}
                  </Button>
                </div>

                {/* Password Protection */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Password Protection
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Set password (optional)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="transition-all hover:scale-105"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Expiry Date
                  </label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Expiry Time */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Expiry Time
                  </label>
                  <Input
                    type="time"
                    value={expiryTime}
                    onChange={(e) => setExpiryTime(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <Button
                  onClick={handleSaveChanges}
                  className="w-full mt-4 transition-all hover:scale-105"
                >
                  Save Changes
                </Button>
              </div>
            </Card>

            {/* Right Section - Share URL & QR Code */}
            <Card className="p-6 animate-in fade-in slide-in-from-right-2 duration-500">
              <h2 className="text-sm font-semibold text-foreground mb-4">
                Share
              </h2>
              <div className="space-y-4">
                {/* Share URL */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Share URL
                  </p>
                  <div className="flex gap-2">
                    <Input value={link.link} readOnly className="text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyLink}
                      className="transition-all hover:scale-105 bg-transparent"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    QR Code
                  </p>
                  <div className="bg-muted p-6 rounded-lg flex items-center justify-center aspect-square animate-in fade-in duration-500">
                    <div className="text-center">
                      <QrCode className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        QR Code Preview
                      </p>
                    </div>
                  </div>
                </div>

                {/* Download QR Button */}
                <Button
                  variant="outline"
                  onClick={handleDownloadQR}
                  className="w-full transition-all hover:scale-105 bg-transparent"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download QR Code
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
