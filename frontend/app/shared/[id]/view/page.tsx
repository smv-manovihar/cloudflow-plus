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
  const [usePasswordProtection, setUsePasswordProtection] = useState(false);
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
        setUsePasswordProtection(data.has_password);
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
    if (link === null) return;

    const trimmedPassword = password.trim();
    const payload: UpdateSharedLinkPayload = {};
    let hasChanges = false;

    // Enabled status
    const enabledChanged = isEnabled !== link.enabled;
    if (enabledChanged === true) {
      payload.enabled = isEnabled;
      hasChanges = true;
    }

    // Expiry handling with explicit flag
    const linkHasExpiry = link.expiresAt !== null;
    const userWantsExpiry = hasExpiry === true;

    if (userWantsExpiry === false && linkHasExpiry === true) {
      // User wants to remove expiry
      payload.remove_expiry = true;
      hasChanges = true;
    } else if (userWantsExpiry === true) {
      // User wants to set/update expiry
      const expiresAtDate = new Date(`${expiryDate}T${expiryTime}:00Z`);
      const isValidDate = !isNaN(expiresAtDate.getTime());

      if (isValidDate === false) {
        toast.error("Invalid expiry date or time");
        return;
      }

      const isFutureDate = expiresAtDate > new Date();
      if (isFutureDate === false) {
        toast.error("Expiration time must be in the future");
        return;
      }

      payload.expires_at = expiresAtDate;
      payload.remove_expiry = false;
      hasChanges = true;
    }

    // Password handling with explicit flag
    const linkHasPassword = link.hasPassword === true;
    const userWantsPassword = usePasswordProtection === true;

    if (userWantsPassword === false && linkHasPassword === true) {
      // User wants to remove password
      payload.remove_password = true;
      hasChanges = true;
    } else if (userWantsPassword === true) {
      // User wants to set/update password
      const hasNewPasswordInput = trimmedPassword.length > 0;
      const needsInitialPassword = linkHasPassword === false;

      if (hasNewPasswordInput === true || needsInitialPassword === true) {
        const passwordLongEnough = trimmedPassword.length >= 4;

        if (passwordLongEnough === false) {
          toast.error("Password must be at least 4 characters");
          return;
        }

        payload.password = trimmedPassword;
        payload.remove_password = false;
        hasChanges = true;
      }
    }

    // Check if there are changes to save
    if (hasChanges === false) {
      toast.info("No changes to save");
      return;
    }

    const res = await updateSharedLink(link.id, payload);
    const saveSucceeded = res.success === true;

    if (saveSucceeded === true) {
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
        <div className="border-b border-border bg-card p-3 md:p-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="transition-all hover:scale-110 flex-shrink-0"
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
      <div className="border-b border-border bg-card p-3 md:p-4 lg:p-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="transition-all hover:scale-110 flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground truncate">
              {link.name}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Manage share settings
            </p>
          </div>
        </div>
      </div>

      {/* Content - Responsive Grid Layout */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-6 lg:gap-8">
            {/* Left Section - File Info */}
            <Card className="p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-left-2 duration-500 min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-foreground mb-4 md:mb-6">
                File Information
              </h2>
              <div className="space-y-4 md:space-y-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    File Name
                  </p>
                  <p className="text-sm md:text-base text-foreground break-words">
                    {link.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    File Size
                  </p>
                  <p className="text-sm md:text-base text-foreground">
                    {link.fileSize.value} {link.fileSize.unit}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Object Key
                  </p>
                  <p className="text-xs md:text-sm text-foreground break-all font-mono bg-muted p-2 md:p-3 rounded">
                    {link.objectKey}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Bucket
                  </p>
                  <p className="text-sm md:text-base text-foreground break-words">
                    {link.bucket}
                  </p>
                </div>

                <div className="pt-3 md:pt-4 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Created At
                  </p>
                  <p className="text-sm md:text-base text-foreground">
                    {link.createdAt}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Downloads
                  </p>
                  <p className="text-sm md:text-base text-foreground">
                    {link.downloads}
                  </p>
                </div>
              </div>
            </Card>

            {/* Middle Section - Access Controls */}
            <Card className="p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500 min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-foreground mb-4 md:mb-6">
                Access Controls
              </h2>
              <div className="space-y-4 md:space-y-5">
                {/* Enable/Disable Link */}
                <div className="flex items-center justify-between p-3 md:p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    {isEnabled ? (
                      <Eye className="h-4 w-4 md:h-5 md:w-5 text-primary flex-shrink-0" />
                    ) : (
                      <EyeOff className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm md:text-base font-medium text-foreground truncate">
                      {isEnabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEnabled(!isEnabled)}
                    className={cn(
                      "transition-all flex-shrink-0 ml-2",
                      isEnabled ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {isEnabled ? "Disable" : "Enable"}
                  </Button>
                </div>

                {/* Expiry Toggle */}
                <div className="flex items-center justify-between gap-4">
                  <label className="text-xs md:text-sm font-medium text-muted-foreground min-w-0">
                    Enable Expiry
                  </label>
                  <Switch
                    checked={hasExpiry}
                    onCheckedChange={setHasExpiry}
                    className="data-[state=checked]:bg-primary flex-shrink-0"
                  />
                </div>

                {/* Expiry Date & Time - Conditional */}
                {hasExpiry && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div>
                      <label className="text-xs md:text-sm font-medium text-muted-foreground mb-2 block">
                        Expiry Date
                      </label>
                      <Input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="text-sm w-full"
                      />
                    </div>

                    <div>
                      <label className="text-xs md:text-sm font-medium text-muted-foreground mb-2 block">
                        Expiry Time
                      </label>
                      <Input
                        type="time"
                        value={expiryTime}
                        onChange={(e) => setExpiryTime(e.target.value)}
                        className="text-sm w-full"
                      />
                    </div>
                  </div>
                )}

                {/* Password Protection */}
                <div>
                  <div className="flex items-center justify-between mb-3 gap-4">
                    <label className="text-xs md:text-sm font-medium text-muted-foreground flex-1 min-w-0">
                      Enable Password Protection
                    </label>
                    <Switch
                      checked={usePasswordProtection}
                      onCheckedChange={setUsePasswordProtection}
                      className="data-[state=checked]:bg-primary flex-shrink-0"
                    />
                  </div>
                  {usePasswordProtection && (
                    <div className="flex gap-2 animate-in fade-in duration-300">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={
                          link.hasPassword
                            ? "Enter new password to change"
                            : "Set password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="text-sm flex-1 min-w-0"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="transition-all hover:scale-105 h-10 w-10 flex-shrink-0"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSaveChanges}
                  className="w-full mt-4 md:mt-6 transition-all hover:scale-105"
                >
                  Save Changes
                </Button>
              </div>
            </Card>

            {/* Right Section - Share URL & QR Code */}
            <Card className="p-4 md:p-6 lg:p-8 animate-in fade-in slide-in-from-right-2 duration-500 min-w-0 lg:col-span-2 2xl:col-span-1">
              <h2 className="text-sm md:text-base font-semibold text-foreground mb-4 md:mb-6">
                Share
              </h2>
              <div className="space-y-4 md:space-y-6">
                {/* Share URL */}
                {/* Share URL - Unified Mobile-Friendly Design */}
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-2 md:mb-3">
                    Share URL
                  </p>

                  {/* Clickable URL Display */}
                  <div
                    onClick={handleCopyLink}
                    className="group flex items-center gap-3 p-3 md:p-4 bg-muted hover:bg-muted/70 rounded-lg border border-border cursor-pointer active:scale-[0.98] transition-all min-h-[56px] md:min-h-[48px]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-1 group-hover:text-primary transition-colors">
                        Tap to copy
                      </p>
                      <p className="text-sm md:text-base text-foreground truncate font-mono">
                        {link.link}
                      </p>
                    </div>
                    <div className="flex-shrink-0 p-2 rounded-md bg-background/50 group-hover:bg-primary/10 transition-colors">
                      <Copy className="h-5 w-5 md:h-4 md:w-4 text-primary" />
                    </div>
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <p className="text-xs md:text-sm font-medium text-muted-foreground mb-2 md:mb-3">
                    QR Code
                  </p>
                  <div className="bg-muted p-6 md:p-8 lg:p-10 rounded-lg flex items-center justify-center w-full max-w-md mx-auto animate-in fade-in duration-500">
                    {qrCode ? (
                      <div className="w-full aspect-square flex items-center justify-center">
                        <img
                          src={qrCode}
                          alt="QR Code"
                          className="max-w-full max-h-full w-auto h-auto object-contain rounded"
                        />
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <QrCode className="h-12 w-12 md:h-16 md:w-16 mx-auto mb-3 text-muted-foreground" />
                        <p className="text-xs md:text-sm text-muted-foreground">
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
                  className="w-full max-w-md mx-auto transition-all hover:scale-105 bg-transparent"
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
