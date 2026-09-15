"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth.context";
import {
  getAdminSettings,
  updateAdminSettings,
  SystemSettingsResponse,
} from "@/api/admin.api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Shield,
  HardDrive,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Share2,
  Terminal,
  AlertTriangle,
  Server,
  Lock,
} from "lucide-react";

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.push("/");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const data = await getAdminSettings();
        if (data) {
          setSettings(data);
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.role === "admin") {
      fetchSettings();
    }
  }, [user]);

  const handleToggleSync = async (enabled: boolean) => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const updated = await updateAdminSettings({ sync_enabled: enabled });
      if (updated) {
        setSettings(updated);
        toast.success(`Platform sync feature ${enabled ? "enabled" : "disabled"}`);
      } else {
        toast.error("Failed to update sync setting");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSharePreferenceChange = async (preference: "primary" | "sync_target") => {
    if (!settings) return;
    if (preference === "sync_target" && !settings.has_sync_target) {
      toast.error("Secondary sync storage is not configured in the environment.");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateAdminSettings({ share_target_preference: preference });
      if (updated) {
        setSettings(updated);
        toast.success(
          `Share link source set to ${
            preference === "primary" ? "Primary Storage" : "Secondary Sync Storage"
          }`
        );
      } else {
        toast.error("Failed to update share target preference");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading admin settings...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="max-w-md w-full text-center p-6 space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
            <Lock className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Admin Access Required</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You must be logged in as an administrator to access this page.
            </p>
          </div>
          <Button onClick={() => router.push("/")} className="w-full">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-7 w-7 text-primary" />
              <h1 className="text-3xl font-bold text-foreground">Admin Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Configure system infrastructure, backup replication, and share link storage policies.
            </p>
          </div>
          <Badge
            variant="outline"
            className="self-start sm:self-auto py-1 px-3 bg-primary/10 text-primary border-primary/20"
          >
            Administrator
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Master Sync Feature Card */}
          <Card className="animate-in fade-in duration-300">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 text-primary" />
                    Automatic Cloud Sync & Backup Policy
                  </CardTitle>
                  <CardDescription>
                    Enable or disable asynchronous background replication to secondary storage platform-wide.
                  </CardDescription>
                </div>
                {settings?.has_sync_target ? (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                    <CloudCheck className="h-3.5 w-3.5 mr-1" />
                    Target Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                    <CloudOff className="h-3.5 w-3.5 mr-1" />
                    No Target Set
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-xl bg-card">
                <div className="space-y-0.5 max-w-xl">
                  <label className="text-sm font-medium text-foreground cursor-pointer" htmlFor="admin-sync-toggle">
                    Enable System Sync Feature
                  </label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, users can replicate files to secondary backup storage and configure auto-syncing.
                  </p>
                </div>
                <Switch
                  id="admin-sync-toggle"
                  checked={Boolean(settings?.sync_enabled)}
                  onCheckedChange={handleToggleSync}
                  disabled={isSaving || !settings?.has_sync_target}
                />
              </div>
              {!settings?.has_sync_target && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Secondary sync target is not configured in backend environment variables (<code>SYNC_TARGET_*</code>).
                    Configure credentials to activate sync replication.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Share Link Storage Source Preference Card */}
          <Card className="animate-in fade-in duration-300 delay-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-primary" />
                Share Link Storage Source Preference
              </CardTitle>
              <CardDescription>
                Choose which storage platform serves shared download links, and whether sharing is gated to synced files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Storage Option */}
                <div
                  onClick={() => handleSharePreferenceChange("primary")}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2",
                    settings?.share_target_preference === "primary"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <HardDrive className="h-4 w-4 text-primary" />
                      Primary Storage
                    </div>
                    {settings?.share_target_preference === "primary" && (
                      <Badge className="bg-primary text-primary-foreground text-xs">Active Policy</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share links generate directly from primary storage. Any file in the catalog can be shared immediately without requiring prior sync.
                  </p>
                </div>

                {/* Secondary Sync Storage Option */}
                <div
                  onClick={() => handleSharePreferenceChange("sync_target")}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "p-4 rounded-xl border transition-all cursor-pointer text-left space-y-2",
                    settings?.share_target_preference === "sync_target"
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:bg-muted/50",
                    !settings?.has_sync_target && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <CloudCheck className="h-4 w-4 text-emerald-600" />
                      Secondary Sync Storage
                    </div>
                    {settings?.share_target_preference === "sync_target" && (
                      <Badge className="bg-primary text-primary-foreground text-xs">Active Policy</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share links are served exclusively from secondary sync storage. <strong>Share link creation is gated to synced files only.</strong>
                  </p>
                </div>
              </div>

              {settings?.share_target_preference === "sync_target" && (
                <div className="p-3.5 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Sync Gating Policy Active:</p>
                  <p>
                    Users can only generate share links for files that have been successfully replicated to secondary sync storage.
                    Attempting to share an unsynced file will prompt the user to sync the file first.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Infrastructure Overview */}
          <Card className="animate-in fade-in duration-300 delay-150">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                Storage Infrastructure Status
              </CardTitle>
              <CardDescription>
                Overview of storage destinations configured in server environment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Primary Storage Bucket</span>
                  <span className="text-sm font-semibold text-foreground break-all">
                    {settings?.primary_bucket || "Not configured"}
                  </span>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <span className="text-xs text-muted-foreground block">Secondary Sync Bucket</span>
                  <span className="text-sm font-semibold text-foreground break-all">
                    {settings?.sync_target_bucket || "None configured"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Credentials & Force Reset Info Card */}
          <Card className="animate-in fade-in duration-300 delay-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                Production Deployment & Credentials CLI
              </CardTitle>
              <CardDescription>
                How to manage admin credentials and force password resets via server CLI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <p>
                Admin credentials are dictated by <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD_HASH</code> in your backend <code>.env</code> file.
              </p>
              <div className="p-3 bg-muted rounded-lg font-mono text-[11px] space-y-2 overflow-x-auto text-foreground">
                <p className="text-muted-foreground"># Generate credentials for production deployment:</p>
                <p>python scripts/set_admin_credentials.py admin@yourdomain.com --generate-prod</p>
                <p className="text-muted-foreground mt-2"># Forcefully reset admin password in database:</p>
                <p>python scripts/set_admin_credentials.py admin@yourdomain.com --force-reset</p>
              </div>
              <p className="pt-1">
                Setting <code>ADMIN_FORCE_RESET=true</code> in your environment forces the server to reset the database admin password to match the configured hash on startup.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
