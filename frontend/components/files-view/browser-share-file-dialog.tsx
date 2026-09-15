import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Calendar, Link2, Lock, AlertTriangle, CloudCheck } from "lucide-react";
import { Input } from "../ui/input";
import { PasswordInput } from "../ui/password-input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { FileItem } from "@/types/files.types";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileItem;
  objectKey: string;
  expires: string;
  password: string;
  shareTargetPreference?: "primary" | "sync_target";
  onExpiresChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onCreateShareLink: () => void;
}

export default function ShareDialog({
  open,
  onOpenChange,
  fileData,
  objectKey,
  expires,
  password,
  shareTargetPreference = "primary",
  onExpiresChange,
  onPasswordChange,
  onCreateShareLink,
}: ShareDialogProps) {
  const isValidExpiry = expires
    ? new Date(expires) > new Date() && !isNaN(new Date(expires).getTime())
    : true;
  const isValidPassword = !password || password.length >= 8;
  const isSyncStorageMode = shareTargetPreference === "sync_target";
  const isFileSynced = fileData?.syncStatus === "true";
  const isGated = isSyncStorageMode && !isFileSynced;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>Create Share Link</DialogTitle>
            {isSyncStorageMode ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 text-xs">
                <CloudCheck className="h-3 w-3 mr-1" />
                Sync Storage
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Primary Storage
              </Badge>
            )}
          </div>
          <DialogDescription>
            Create a secure shareable link for this file. Expiry time is in your local timezone.
          </DialogDescription>
        </DialogHeader>

        {isGated && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Sync Required</p>
              <p className="mt-0.5">
                The platform is configured to create share links from secondary sync storage. Please sync this file before generating a share link.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expires" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Expires At (optional)
              </Label>
              <Input
                id="expires"
                type="datetime-local"
                value={expires}
                onChange={(e) => onExpiresChange(e.target.value)}
                className="w-full"
                min={new Date().toISOString().slice(0, 16)}
                disabled={isGated}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password (optional)
              </Label>
              <PasswordInput
                id="password"
                placeholder="Enter password (min 8 characters)"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                className="w-full"
                disabled={isGated}
              />
              {password && password.length < 8 && (
                <p className="text-xs text-amber-500 dark:text-amber-400">
                  Password must be at least 8 characters
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={onCreateShareLink}
              className="gap-2 bg-primary hover:bg-primary/90"
              disabled={
                !objectKey ||
                !isValidExpiry ||
                !isValidPassword ||
                isGated
              }
            >
              <Link2 className="h-4 w-4" />
              Create Share Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
