"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Copy, Download, QrCode, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { getLinkInfo, updateSharedLink, getQrCode } from "@/api/share.api";
import { UpdateSharedLinkPayload } from "@/types/share.types";
import { formatFileSize } from "@/utils/helpers";

interface SharedLinkDetails {
  id: string;
  name: string;
  fileSize: { value: string; unit: string };
  objectKey: string;
  bucket: string;
  link: string;
  status: "active" | "expired" | "disabled";
  expiresAt: string | null;
  createdAt: string;
  downloads: number;
  password?: string;
  isPasswordProtected: boolean;
  enabled: boolean;
  hasPassword: boolean;
}

export default function SharedLinkViewPage() {
  const router = useRouter();
  const params = useParams();

  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState<SharedLinkDetails | null>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasExpiry, setHasExpiry] = useState(true);
  const [password, setPassword] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [expiryTime, setExpiryTime] = useState("00:00");
  const [showPassword, setShowPassword] = useState(false);

  const fetchLinkData = async () => {
    if (!params.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await getLinkInfo(params.id as string);
      if (res.success) {
        const data = res.result;
        const expTime = data.expires_at ? new Date(data.expires_at) : null;
        const isExpired = expTime && expTime <= new Date();
        const currentStatus =
          data.enabled && !isExpired
            ? "active"
            : data.enabled
            ? "expired"
            : "disabled";

        const createdDate = data.created_at.split("T")[0];

        setLink({
          id: data.id,
          name: data.name,
          fileSize: formatFileSize(data.size_bytes),
          objectKey: data.object_key,
          bucket: data.bucket,
          link: `${window.location.origin}/shared/${data.id}/download`,
          status: currentStatus,
          expiresAt: data.expires_at || null,
          createdAt: createdDate,
          downloads: 0,
          password: "",
          isPasswordProtected: data.has_password,
          enabled: data.enabled,
          hasPassword: data.has_password,
        });

        setIsEnabled(data.enabled);
        setHasExpiry(!!data.expires_at);
        if (data.expires_at) {
          setExpiryDate(expTime!.toISOString().split("T")[0]);
          setExpiryTime(
            expTime!.toISOString().split("T")[1]?.slice(0, 5) || "00:00"
          );
        } else {
          setExpiryDate("");
          setExpiryTime("00:00");
        }

        const qrRes = await getQrCode(data.id);
        if (qrRes.success) {
          setQrCode(qrRes.result);
        } else {
          toast.error(qrRes.error || "Failed to load QR code");
        }
      } else {
        toast.error(res.error || "Failed to fetch link info");
      }
    } catch (error) {
      toast.error("An unexpected error occurred while fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkData();
  }, [params.id]);

  const handleCopyLink = () => {
    if (!link) return;
    navigator.clipboard
      .writeText(link.link)
      .then(() => toast.success("Link copied to clipboard", { duration: 2000 }))
      .catch(() => toast.error("Failed to copy link"));
  };

  const handleDownloadQR = async () => {
    if (!link) return;

    let currentQrCode = qrCode;
    if (!currentQrCode) {
      const res = await getQrCode(link.id);
      if (!res.success) {
        toast.error(res.error || "Failed to generate QR code");
        return;
      }
      currentQrCode = res.result;
      setQrCode(currentQrCode);
    }

    const a = document.createElement("a");
    a.href = currentQrCode;
    a.download = `qr-${link.name.split(".")[0]}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("QR code downloaded", { duration: 2000 });
  };

  const handleSaveChanges = async () => {
    if (!link) return;

    const trimmedPassword = password.trim();
    const payload: UpdateSharedLinkPayload = {
      enabled: isEnabled,
    };

    if (trimmedPassword) {
      payload.password = trimmedPassword;
    }

    if (hasExpiry) {
      const expiresAtDate = new Date(`${expiryDate}T${expiryTime}:00`);
      if (isNaN(expiresAtDate.getTime())) {
        toast.error("Invalid expiry date or time");
        return;
      }
      payload.expires_at = expiresAtDate;
    }
    // If !hasExpiry, expires_at is undefined, which should remove/set no expiry

    const res = await updateSharedLink(link.id, payload);
    if (res.success) {
      toast.success("Changes saved successfully", { duration: 2000 });
      await fetchLinkData();
      setPassword(""); // Clear password input after save
    } else {
      toast.error(res.error || "Failed to save changes");
    }
  };

  if (loading || !link) {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-card p-1 md:p-2 animate-in fade-in slide-in-from-top-2 duration-500">
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
                Loading...
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage share settings
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">
            Loading shared link details...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card p-1 md:p-2 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center ml-1 gap-3 mb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="transition-all hover:scale-110"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg md:text-xl font-semibold text-foreground truncate">
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
                  <p className="text-sm text-foreground">
                    {link.fileSize.value} {link.fileSize.unit}
                  </p>
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

                {/* Expiry Toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Enable Expiry
                  </label>
                  <Switch
                    checked={hasExpiry}
                    onCheckedChange={setHasExpiry}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                {/* Expiry Date & Time - Conditional */}
                {hasExpiry && (
                  <>
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
                  </>
                )}

                {/* Password Protection */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Password Protection
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder={
                        link.hasPassword
                          ? "Enter new password to change"
                          : "Set password (optional)"
                      }
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
                    {qrCode ? (
                      <img
                        src={qrCode}
                        alt="QR Code"
                        className="max-w-full max-h-full rounded"
                      />
                    ) : (
                      <div className="text-center">
                        <QrCode className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          QR Code Preview
                        </p>
                      </div>
                    )}
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
